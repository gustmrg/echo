using Echo.API.Database;
using Echo.API.Entities;
using Echo.API.Enums;
using Echo.API.Shared;
using Echo.API.Storage;

namespace Echo.API.Features.Recordings;

public static class CreateRecording
{
    private const int MaxFileSize = 25 * 1024 * 1024;

    public static async Task<IResult> Handle(
        IFormFile file, 
        IFileStorage fileStorage, 
        EchoDbContext dbContext,
        CancellationToken ct = default)
    {
        if (file.Length == 0)
            return Results.BadRequest("File is empty");
        
        if (file.Length > MaxFileSize)
            return Results.BadRequest("File exceeds 25MB limit.");
        
        if (!AudioFileValidator.IsSupportedContentType(file.ContentType))
            return Results.BadRequest("Unsupported audio format.");
        
        using var stream = file.OpenReadStream();
        if (!await AudioFileValidator.IsValidAudioFileAsync(stream, file.ContentType))
            return Results.BadRequest("File content does not match its declared type.");

        var recordingId = Guid.CreateVersion7();
        var fileKey = await fileStorage.UploadAsync(recordingId.ToString(), 
            file.FileName, stream, file.ContentType, ct);
        
        var record = new Recording
        {
            Id = recordingId,
            FileName = file.FileName,
            ContentType = file.ContentType,
            S3Key = fileKey,    
            CreatedAt = DateTime.UtcNow,
            Status = RecordingStatus.Pending
        };
        
        dbContext.Add(record);
        await dbContext.SaveChangesAsync(ct);
        
        // queue transcription job
        
        return Results.Created($"/recording/{record.Id}", record);
    }
}
