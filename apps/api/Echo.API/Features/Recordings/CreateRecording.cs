namespace Echo.API.Features.Recordings;

public static class CreateRecording
{
    private const int MaxFileSize = 5 * 1024 * 1024;
    private static readonly string[] AllowedTypes = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav"];

    public static async Task<IResult> Handle(IFormFile file)
    {
        if (file.Length == 0)
            return Results.BadRequest("File is empty");
        
        if (file.Length > MaxFileSize)
            return Results.BadRequest("File exceeds 50MB limit.");
        
        if (!AllowedTypes.Contains(file.ContentType))
            return Results.BadRequest("Unsupported audio format.");
        
        // validate file before uploading
        // upload file to s3/minio
        // save recording
        // queue transcription job
        
        return Results.Ok();
    }
}