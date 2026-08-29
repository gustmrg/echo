using Echo.API.Database;
using Echo.API.Storage;
using Microsoft.EntityFrameworkCore;

namespace Echo.API.Features.Recordings;

public class DeleteRecording
{
    public static async Task<IResult> Handle(
        Guid id,
        IFileStorage fileStorage,
        EchoDbContext dbContext,
        ILogger<DeleteRecording> logger,
        CancellationToken ct = default)
    {
        var recording = await dbContext.Recordings
            .FirstOrDefaultAsync(recording => recording.Id == id, ct);

        if (recording is null)
            return Results.NotFound();

        if (!string.IsNullOrWhiteSpace(recording.StorageKey))
        {
            try
            {
                await fileStorage.DeleteAsync(recording.StorageKey, ct);
            }
            catch (Exception deleteError)
            {
                logger.LogError(deleteError, "Failed to delete file {FileKey} for recording {RecordingId}", recording.StorageKey, recording.Id);
                return Results.Problem("File storage is unavailable");
            }
        }

        dbContext.Remove(recording);
        await dbContext.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}
