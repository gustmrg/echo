using Echo.API.Database;
using Echo.API.Entities;
using Echo.API.Enums;
using Echo.API.Features.Jobs;
using Microsoft.EntityFrameworkCore;

namespace Echo.API.Features.Refinements;

/// <summary>Queues one format from an exact revision, with a retry-safe request key.</summary>
public sealed record CreateRefinementRequest(string Format, int ExpectedRevision, Guid RequestKey, bool Regenerate = false);

public static class CreateRefinement
{
    public static async Task<IResult> Handle(Guid recordingId, CreateRefinementRequest request,
        EchoDbContext db, IJobDispatcherSignal dispatcherSignal, CancellationToken ct)
    {
        if (request.Format is not ("blog" or "interview" or "notes" or "news") || request.RequestKey == Guid.Empty)
            return Results.BadRequest("Choose blog, interview, notes, or news and supply a request key.");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var recording = await db.Recordings.SingleOrDefaultAsync(r => r.Id == recordingId, ct);
        if (recording is null) return Results.NotFound();
        var key = request.RequestKey.ToString();
        var previous = await db.RefinementRequests.Include(r => r.Job)
            .SingleOrDefaultAsync(r => r.RecordingId == recordingId && r.RequestKey == key, ct);
        if (previous is not null)
        {
            if (previous.Format != request.Format || previous.TranscriptRevision != request.ExpectedRevision || previous.Regenerate != request.Regenerate)
                return Results.Conflict("This request key belongs to a different generation.");
            return Results.Accepted($"/api/recordings/{recordingId}/refinements", RefinementResponse.FromJob(previous.Job));
        }
        if (recording.Status != RecordingStatus.Transcribed || recording.TranscriptRevision != request.ExpectedRevision)
            return Results.Conflict("Reload the saved transcript before refining it.");
        var text = recording.EditedText ?? recording.TranscribedText;
        if (string.IsNullOrWhiteSpace(text) || text.Length > 200_000)
            return Results.BadRequest("A non-empty transcript of at most 200,000 characters is required.");
        var existing = await db.RefinementJobs.Where(j => j.RecordingId == recordingId &&
                j.TranscriptRevision == request.ExpectedRevision && j.Format == request.Format &&
                (j.Status == JobStatus.Created || j.Status == JobStatus.Processing ||
                 (!request.Regenerate && j.Status == JobStatus.Completed)))
            .OrderByDescending(j => j.CreatedAt).ThenByDescending(j => j.Id).FirstOrDefaultAsync(ct);
        var job = existing ?? new RefinementJob
        {
            Id = Guid.CreateVersion7(), RecordingId = recordingId, RequestKey = key,
            Format = request.Format, TranscriptRevision = request.ExpectedRevision, SourceText = text
        };
        if (existing is null) db.RefinementJobs.Add(job);
        db.RefinementRequests.Add(new RefinementRequest
        {
            RecordingId = recordingId, RequestKey = key, JobId = job.Id, Format = request.Format,
            TranscriptRevision = request.ExpectedRevision, Regenerate = request.Regenerate
        });
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        if (existing is null)
            dispatcherSignal.Notify();
        return Results.Accepted($"/api/recordings/{recordingId}/refinements", RefinementResponse.FromJob(job));
    }
}

