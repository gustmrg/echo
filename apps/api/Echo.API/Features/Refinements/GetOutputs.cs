using Echo.API.Database;
using Echo.API.Enums;
using Microsoft.EntityFrameworkCore;

namespace Echo.API.Features.Refinements;

public sealed record OutputSummaryResponse(
    Guid Id,
    Guid RecordingId,
    string? RecordingTitle,
    string RecordingFileName,
    string Format,
    int TranscriptRevision,
    int WordCount,
    string? Model,
    string? Provider,
    DateTime CreatedAt);

public sealed record OutputsPageResponse(
    IReadOnlyList<OutputSummaryResponse> Items,
    int Page,
    int PageSize,
    int TotalCount,
    bool HasMore,
    bool HasActiveJobs);

public static class GetOutputs
{
    public static async Task<IResult> Handle(
        EchoDbContext db,
        int page = 1,
        int pageSize = 20,
        string? format = null,
        CancellationToken ct = default)
    {
        var clampedPage = Math.Max(1, page);
        var clampedPageSize = Math.Clamp(pageSize, 1, 100);

        string? normalizedFormat = null;
        if (!string.IsNullOrWhiteSpace(format))
        {
            normalizedFormat = format.Trim().ToLowerInvariant();
            if (normalizedFormat is not ("blog" or "interview" or "notes" or "news"))
                return Results.BadRequest("Invalid format filter. Allowed values: blog, interview, notes, news.");
        }

        var currentRevisionJobs = db.RefinementJobs
            .AsNoTracking()
            .Where(j => j.TranscriptRevision == j.Recording.TranscriptRevision);

        if (normalizedFormat is not null)
        {
            var formatValue = normalizedFormat;
            currentRevisionJobs = currentRevisionJobs.Where(j => j.Format == formatValue);
        }

        var completedQuery = currentRevisionJobs.Where(j => j.Status == JobStatus.Completed);

        var totalCount = await completedQuery.CountAsync(ct);

        var rows = await completedQuery
            .OrderByDescending(j => j.CreatedAt)
            .ThenByDescending(j => j.Id)
            .Skip((clampedPage - 1) * clampedPageSize)
            .Take(clampedPageSize)
            .Select(j => new
            {
                j.Id,
                j.RecordingId,
                RecordingTitle = j.Recording.Title,
                RecordingFileName = j.Recording.FileName,
                j.Format,
                j.TranscriptRevision,
                j.Content,
                j.Model,
                j.Provider,
                j.CreatedAt,
            })
            .ToListAsync(ct);

        var hasActiveJobs = await currentRevisionJobs
            .AnyAsync(j => j.Status == JobStatus.Created || j.Status == JobStatus.Processing, ct);

        var items = rows
            .Select(r => new OutputSummaryResponse(
                r.Id,
                r.RecordingId,
                r.RecordingTitle,
                r.RecordingFileName,
                r.Format,
                r.TranscriptRevision,
                CountWords(r.Content),
                r.Model,
                r.Provider,
                r.CreatedAt))
            .ToList();

        var hasMore = (long)clampedPage * clampedPageSize < totalCount;

        return Results.Ok(new OutputsPageResponse(
            items,
            clampedPage,
            clampedPageSize,
            totalCount,
            hasMore,
            hasActiveJobs));
    }

    private static int CountWords(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
            return 0;

        var count = 0;
        var inWord = false;
        foreach (var ch in content)
        {
            if (char.IsWhiteSpace(ch))
            {
                inWord = false;
            }
            else if (!inWord)
            {
                inWord = true;
                count++;
            }
        }

        return count;
    }
}
