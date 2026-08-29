namespace Echo.API.Storage;

public interface IFileStorage
{
    string CreateFileKey(string fileName, FileStorageContext context, string identifier);
    Task UploadAsync(string fileKey, Stream fileStream, string contentType, CancellationToken cancellationToken);
    Task DeleteAsync(string fileKey, CancellationToken cancellationToken = default);
}

public enum FileStorageContext
{
    UserAvatar,
    AudioRecording,
}
