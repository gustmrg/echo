using Echo.API.Database;
using Microsoft.EntityFrameworkCore;

namespace Echo.API.Features.Recordings;

public class GetRecordingById
{
    public static async Task<IResult> Handle(
        Guid id,
        EchoDbContext dbContext,
        ILogger<GetRecordingById> logger,
        CancellationToken ct = default)
    {
        var recording = await dbContext.Recordings
            .AsNoTracking()
            .FirstOrDefaultAsync(recording => recording.Id == id, ct);

        if (recording is null)
            return Results.NotFound();

        return Results.Ok(RecordingResponse.FromRecording(recording));
    }
}
