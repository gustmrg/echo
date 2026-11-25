using Echo.API.Database;
using Echo.API.Entities;
using Echo.API.Enums;
using Echo.API.Features.Jobs;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Echo.API.Shared;
using Echo.API.Storage;

namespace Echo.API.Features.Recordings;

public class CreateRecording
{
    private const int MaxFileSize = 25 * 1024 * 1024; // 25 MB

    public static async Task<IResult> Handle(
        IFormFile file, 
        IFileStorage fileStorage, 
        EchoDbContext dbContext,
        IJobDispatcherSignal dispatcherSignal,
        ILogger<CreateRecording> logger,
        HttpRequest request,
        CancellationToken ct = default)
    {
        if (file.Length == 0)
            return Results.BadRequest("File is empty");
        
        if (file.Length > MaxFileSize)
            return Results.BadRequest("File exceeds 25MB limit.");
        
        var contentType = AudioFileValidator.NormalizeContentType(file.ContentType);
        
        if (!AudioFileValidator.IsSupportedContentType(contentType))
            return Results.BadRequest("Unsupported audio format.");
        
        using var stream = file.OpenReadStream();
        if (!await AudioFileValidator.IsValidAudioFileAsync(stream, contentType))
            return Results.BadRequest("File content does not match its declared type.");
        
        stream.Position = 0;
        var keyHeader = request.Headers["Idempotency-Key"].ToString();
        if (!Guid.TryParse(keyHeader, out var uploadKey))
            return Results.BadRequest("A UUID Idempotency-Key header is required.");
        var key = uploadKey.ToString();
        var audioHash = await SHA256.HashDataAsync(stream, ct);
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
            $"{Convert.ToHexString(audioHash)}\n{file.FileName}\n{contentType}")));
        stream.Position = 0;
        var existing = await dbContext.Recordings.AsNoTracking()
            .SingleOrDefaultAsync(r => r.UploadKey == key, ct);
        if (existing is not null)
            return Replay(existing, hash);

        var recordingId = Guid.CreateVersion7();
        var fileKey = fileStorage.CreateFileKey(file.FileName, FileStorageContext.AudioRecording, recordingId.ToString());
        
        try
        {
            await fileStorage.UploadAsync(fileKey, stream, contentType, ct);
        }
        catch (Exception uploadError)
        {
            logger.LogError(uploadError, "Failed to upload file {FileKey}", fileKey);
            return Results.Problem("File storage is unavailable");
        }
        
        var record = new Recording
        {
            Id = recordingId,
            UploadKey = key,
            UploadHash = hash,
            FileName = file.FileName,
            FileSizeBytes = file.Length,
            ContentType = contentType,
            StorageKey = fileKey,
            Status = RecordingStatus.Pending
        };
        
        dbContext.Add(record);
        
        var transcriptionJob = new TranscriptionJob
        {
            Id = Guid.CreateVersion7(),
            RecordingId = recordingId,
        };
        
        dbContext.Add(transcriptionJob);
        
        try
        {
            await dbContext.SaveChangesAsync(ct);
        }
        catch (Exception saveError)
        {
            logger.LogError(saveError, "Failed to save recording {RecordingId} after uploading file {FileKey}", recordingId, fileKey);

            try
            {
                await fileStorage.DeleteAsync(fileKey);
            }
            catch (Exception cleanupError)
            {
                logger.LogError(cleanupError, "Failed to delete uploaded file {FileKey} after database save failure", fileKey);
            }
            
            // A concurrent request with the same key may have won the unique index.
            dbContext.ChangeTracker.Clear();
            existing = await dbContext.Recordings.AsNoTracking()
                .SingleOrDefaultAsync(r => r.UploadKey == key, ct);
            if (existing is not null) return Replay(existing, hash);
            return Results.Problem("Failed to save recording.");
        }

        dispatcherSignal.Notify();

        return Results.Created($"/api/recordings/{record.Id}", RecordingResponse.FromRecording(record));
    }

    private static IResult Replay(Recording recording, string hash) =>
        recording.UploadHash == hash
            ? Results.Ok(RecordingResponse.FromRecording(recording))
            : Results.Conflict("This upload key was already used for different audio.");
}
