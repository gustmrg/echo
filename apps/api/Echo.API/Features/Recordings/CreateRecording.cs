using Echo.API.Shared;

namespace Echo.API.Features.Recordings;

public static class CreateRecording
{
    private const int MaxFileSize = 25 * 1024 * 1024;

    public static async Task<IResult> Handle(IFormFile file)
    {
        if (file.Length == 0)
            return Results.BadRequest("File is empty");
        
        if (file.Length > MaxFileSize)
            return Results.BadRequest("File exceeds 25MB limit.");
        
        if (!AudioFileValidator.IsSupportedContentType(file.ContentType))
            return Results.BadRequest("Unsupported audio format.");
        
        // validate file before uploading
        using var stream = file.OpenReadStream();
        if (!await AudioFileValidator.IsValidAudioFileAsync(stream, file.ContentType))
            return Results.BadRequest("File content does not match its declared type.");
        
        // upload file to s3/minio
        // save recording
        // queue transcription job
        
        return Results.Ok();
    }
}
