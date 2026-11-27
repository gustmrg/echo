using Echo.API.Database;
using Echo.API.Enums;
using Echo.API.Shared;
using Microsoft.EntityFrameworkCore;

namespace Echo.API.Features.Recordings;

/// <summary>Retries the failed attempt the caller has reviewed.</summary>
public sealed record RetryTranscriptionRequest(int ExpectedRetryCount);

public static class RetryTranscription
{
    public static async Task<IResult> Handle(Guid id, RetryTranscriptionRequest request,
        EchoDbContext db, HttpContext httpContext, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var recording = await db.Recordings.Include(r => r.TranscriptionJob)
            .SingleOrDefaultAsync(r => r.Id == id, ct);
        if (recording is null) return Results.NotFound();
        var job = recording.TranscriptionJob;
        if (recording.Status is RecordingStatus.Pending or RecordingStatus.Transcribing)
            return Results.Accepted($"/api/recordings/{id}", RecordingResponse.FromRecording(recording));
        if (recording.Status != RecordingStatus.Failed || job.Status != JobStatus.Failed ||
            job.RetryCount != request.ExpectedRetryCount)
            return Results.Conflict("Only the current failed transcription can be retried.");
        recording.Status = RecordingStatus.Pending;
        recording.UpdatedAt = DateTime.UtcNow;
        job.Status = JobStatus.Created;
        job.AttemptCount = 0;
        job.ClaimToken = null;
        job.CorrelationId = CorrelationId.NormalizeOrNull(httpContext.TraceIdentifier);
        job.NextAttemptAt = null;
        job.FailureReason = null;
        job.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return Results.Accepted($"/api/recordings/{id}", RecordingResponse.FromRecording(recording));
    }
}
