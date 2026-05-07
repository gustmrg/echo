namespace Echo.API.Storage;

public interface IFileStorage
{
    string CreateFileKey(string fileName, FileStorageContext context, string identifier);
    string GetUrl(string fileKey);
    Task UploadAsync(string fileKey, Stream fileStream, string contentType, CancellationToken cancellationToken);
    Task DownloadAsync(string fileKey, IFormFile file);
    Task DeleteAsync(string fileKey);
}

public enum FileStorageContext
{
    UserAvatar,
    AudioRecording,
}