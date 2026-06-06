using Echo.API.Database;
using Echo.API.Entities;
using Echo.API.Enums;
using Echo.API.Messaging;
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
        ILogger<CreateRecording> logger,
        IMessagePublisher publisher,
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
            FileName = file.FileName,
            FileSizeBytes = file.Length,
            ContentType = contentType,
            S3Key = fileKey,    
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
            
            return Results.Problem("Failed to save recording.");
        }

        var message = new TranscriptionRequestedMessage(recordingId, fileKey);
        
        await publisher.PublishAsync(
            exchange: Exchanges.Events, 
            Queues.RecordingWorker, 
            RoutingKeys.Recording.TranscriptionRequested, 
            message, ct);
        
        return Results.Created($"/recording/{record.Id}", RecordingResponse.FromRecording(record));
    }
}

public record TranscriptionRequestedMessage(Guid RecordingId, string FileKey);