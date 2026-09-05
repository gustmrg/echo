using Echo.API.Database;
using Echo.API.Entities;
using Echo.API.Enums;
using Microsoft.EntityFrameworkCore;

namespace Echo.API.Features.Refinements;

public static class GetRefinements
{
    public static async Task<IResult> Handle(Guid recordingId, EchoDbContext db, CancellationToken ct)
    {
        var recording = await db.Recordings.AsNoTracking().SingleOrDefaultAsync(r => r.Id == recordingId, ct);
        if (recording is null) return Results.NotFound();
        var jobs = await db.RefinementJobs.AsNoTracking()
            .Where(j => j.RecordingId == recordingId && j.TranscriptRevision == recording.TranscriptRevision)
            .OrderByDescending(j => j.CreatedAt).ThenByDescending(j => j.Id)
            .Take(50).Select(j => new RefinementResponse(j.Id, j.Format, j.TranscriptRevision,
                j.Status.ToString().ToLower(), j.Content, j.FailureReason, j.Model, j.Provider,
                j.PromptVersion, j.CreatedAt)).ToListAsync(ct);
        return Results.Ok(jobs);
    }
}
