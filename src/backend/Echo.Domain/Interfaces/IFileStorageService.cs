namespace Echo.Domain.Interfaces;

public interface IFileStorageService
{
    string? GetFileUrl(string fileKey);
    Task<string> UploadFileAsync(
        Stream fileStream, 
        string fileName, 
        string contentType, 
        FileStorageContext context, 
        string? identifier = null);
    Task DeleteFileAsync(string fileKey);
    Task<bool> FileExistsAsync(string? fileKey);
}

public enum FileStorageContext
{
    UserAvatar,
    AudioRecording,
}