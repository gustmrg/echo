using Echo.API.Database;
using Microsoft.EntityFrameworkCore;

namespace Echo.API.Features.Recordings;

public class GetRecordings
{
    public static async Task<IResult> Handle(
        EchoDbContext dbContext,
        ILogger<GetRecordings> logger,
        CancellationToken ct = default)
    {
        var recordingEntities = await dbContext.Recordings
            .AsNoTracking()
            .ToListAsync(ct);

        var recordings = recordingEntities.Select(RecordingResponse.FromRecording);

        return Results.Ok(recordings);
    }
}
