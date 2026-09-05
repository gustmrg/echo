using System.Text.Json;
using Echo.API.Database;
using Echo.API.Enums;
using Microsoft.EntityFrameworkCore;

namespace Echo.API.Features.Jobs;

// Job rows are committed by HTTP handlers. This API-owned dispatcher atomically
// moves each pending job into the outbox; RabbitMQ never participates in an HTTP transaction.
public static class JobDispatch
{
    public static async Task Prepare(EchoDbContext db, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var now = DateTime.UtcNow;
        var transcription = await db.TranscriptionJobs.Include(j => j.Recording)
            .Where(j => j.Status == JobStatus.Created && (j.NextAttemptAt == null || j.NextAttemptAt <= now))
            .OrderBy(j => j.CreatedAt).Take(20).ToListAsync(ct);
        foreach (var job in transcription)
        {
            job.Status = JobStatus.Processing;
            job.ClaimToken = Guid.NewGuid().ToString();
            job.AttemptCount++;
            job.UpdatedAt = now;
            job.NextAttemptAt = null;
            job.Recording.Status = RecordingStatus.Transcribing;
            job.Recording.UpdatedAt = now;
            Add(db, new(job.Id.ToString(), job.ClaimToken, "transcription",
                job.Recording.StorageKey, job.Recording.FileName, job.Recording.ContentType));
        }
        var refinements = await db.RefinementJobs
            .Where(j => j.Status == JobStatus.Created && (j.NextAttemptAt == null || j.NextAttemptAt <= now))
            .OrderBy(j => j.CreatedAt).Take(20).ToListAsync(ct);
        foreach (var job in refinements)
        {
            job.Status = JobStatus.Processing;
            job.ClaimToken = Guid.NewGuid().ToString();
            job.AttemptCount++;
            job.UpdatedAt = now;
            job.NextAttemptAt = null;
            Add(db, new(job.Id.ToString(), job.ClaimToken, "refinement", SourceText: job.SourceText, Format: job.Format));
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }

    private static void Add(EchoDbContext db, JobMessage message) => db.JobOutbox.Add(new()
    {
        Id = Guid.CreateVersion7(), Payload = JsonSerializer.Serialize(message, RabbitOptions.Json)
    });

    public static async Task Apply(EchoDbContext db, JobResult result, CancellationToken ct)
    {
        if (!Guid.TryParse(result.JobId, out var id) || !Guid.TryParse(result.ClaimToken, out _) ||
            result.Kind is not ("transcription" or "refinement") || result.Status is not ("completed" or "failed") ||
            (result.Status == "completed" && (result.Kind == "transcription"
                ? string.IsNullOrWhiteSpace(result.TranscriptionText)
                : string.IsNullOrWhiteSpace(result.Content) || string.IsNullOrWhiteSpace(result.Model) ||
                  string.IsNullOrWhiteSpace(result.Provider) || string.IsNullOrWhiteSpace(result.PromptVersion))))
            throw new JsonException("Invalid job result");
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var now = DateTime.UtcNow;
        if (result.Kind == "transcription")
        {
            var job = await db.TranscriptionJobs.Include(j => j.Recording).SingleOrDefaultAsync(j => j.Id == id, ct);
            if (job is null || job.Status != JobStatus.Processing || job.ClaimToken != result.ClaimToken) return;
            var retry = result.Status == "failed" && result.Retryable && job.AttemptCount < 3;
            job.Status = result.Status == "completed" ? JobStatus.Completed : retry ? JobStatus.Created : JobStatus.Failed;
            job.ClaimToken = null;
            job.UpdatedAt = now;
            job.NextAttemptAt = retry ? now.AddSeconds(5 * Math.Pow(2, job.AttemptCount - 1)) : null;
            job.FailureReason = result.Status == "failed" ? "Transcription could not be completed. Check configuration or retry." : null;
            job.Recording.Status = result.Status == "completed" ? RecordingStatus.Transcribed : retry ? RecordingStatus.Pending : RecordingStatus.Failed;
            job.Recording.UpdatedAt = now;
            if (result.Status == "completed")
            {
                job.Recording.TranscribedText = result.TranscriptionText;
                job.Recording.EditedText = result.TranscriptionText;
                job.Recording.TranscriptRevision++;
            }
            else job.RetryCount++;
        }
        else
        {
            var job = await db.RefinementJobs.SingleOrDefaultAsync(j => j.Id == id, ct);
            if (job is null || job.Status != JobStatus.Processing || job.ClaimToken != result.ClaimToken) return;
            var retry = result.Status == "failed" && result.Retryable && job.AttemptCount < 3;
            job.Status = result.Status == "completed" ? JobStatus.Completed : retry ? JobStatus.Created : JobStatus.Failed;
            job.ClaimToken = null;
            job.UpdatedAt = now;
            job.NextAttemptAt = retry ? now.AddSeconds(5 * Math.Pow(2, job.AttemptCount - 1)) : null;
            job.FailureReason = result.Status == "failed" ? "Refinement could not be completed. Check configuration or generate again." : null;
            if (result.Status == "completed")
            {
                job.Content = result.Content; job.Model = result.Model;
                job.Provider = result.Provider; job.PromptVersion = result.PromptVersion;
            }
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    }
}
