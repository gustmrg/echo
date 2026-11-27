using Echo.API.Database;
using Echo.API.Enums;
using Echo.API.Shared;
using Microsoft.EntityFrameworkCore;

namespace Echo.API.Features.Recordings;

public class GetRecordings
{
    public static async Task<IResult> Handle(
        EchoDbContext dbContext,
        ILogger<GetRecordings> logger,
        int page = 1,
        int pageSize = 20,
        string? status = null,
        string? q = null,
        CancellationToken ct = default)
    {
        var clampedPage = Math.Max(1, page);
        var clampedPageSize = Math.Clamp(pageSize, 1, 100);

        RecordingStatus? parsedStatus = null;
        if (!string.IsNullOrWhiteSpace(status))
        {
            parsedStatus = status.Trim().ToLowerInvariant() switch
            {
                "pending" => RecordingStatus.Pending,
                "transcribing" => RecordingStatus.Transcribing,
                "transcribed" => RecordingStatus.Transcribed,
                "failed" => RecordingStatus.Failed,
                _ => null
            };

            if (parsedStatus is null)
                return Results.BadRequest("Invalid status filter. Allowed values: pending, transcribing, transcribed, failed.");
        }

        var query = dbContext.Recordings.AsNoTracking();

        if (parsedStatus is not null)
        {
            var statusValue = parsedStatus.Value;
            query = query.Where(r => r.Status == statusValue);
        }

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().ToLowerInvariant();
            query = query.Where(r =>
                (r.Title != null && r.Title.ToLower().Contains(term)) ||
                r.FileName.ToLower().Contains(term));
        }

        var totalCount = await query.CountAsync(ct);

        var rows = await query
            .OrderByDescending(r => r.CreatedAt)
            .ThenByDescending(r => r.Id)
            .Skip((clampedPage - 1) * clampedPageSize)
            .Take(clampedPageSize)
            .Select(r => new
            {
                r.Id,
                r.Title,
                r.Status,
                r.FileName,
                r.FileSizeBytes,
                r.ContentType,
                r.TranscriptRevision,
                FailureReason = r.TranscriptionJob != null ? r.TranscriptionJob.FailureReason : null,
                AttemptCount = r.TranscriptionJob != null ? r.TranscriptionJob.AttemptCount : 0,
                RetryCount = r.TranscriptionJob != null ? r.TranscriptionJob.RetryCount : 0,
                r.CreatedAt,
                r.UpdatedAt,
            })
            .ToListAsync(ct);

        var items = rows
            .Select(r => new RecordingSummaryResponse(
                r.Id,
                r.Title,
                r.Status.ToString().ToLowerInvariant(),
                r.FileName,
                r.FileSizeBytes,
                r.ContentType,
                r.TranscriptRevision,
                r.FailureReason,
                r.AttemptCount,
                r.RetryCount,
                r.CreatedAt,
                r.UpdatedAt))
            .ToList();

        var hasMore = (long)clampedPage * clampedPageSize < totalCount;

        return Results.Ok(new PagedResponse<RecordingSummaryResponse>(
            items,
            clampedPage,
            clampedPageSize,
            totalCount,
            hasMore));
    }
}
