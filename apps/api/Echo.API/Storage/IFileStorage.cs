namespace Echo.API.Storage;

public interface IFileStorage
{
    string GetUrl(string fileKey);
    Task<string> UploadAsync(string identifier, string fileName, Stream fileStream, string contentType,
        CancellationToken cancellationToken);
    Task DownloadAsync(string fileKey, IFormFile file);
    Task DeleteAsync(string fileKey);
}

public enum FileStorageContext
{
    UserAvatar,
    AudioRecording,
}