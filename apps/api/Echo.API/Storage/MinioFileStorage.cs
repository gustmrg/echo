using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;

namespace Echo.API.Storage;

public class MinioFileStorage : IFileStorage
{
    private readonly IAmazonS3 _s3Client;
    private readonly S3Options _settings;
    private readonly ILogger<MinioFileStorage> _logger;

    public MinioFileStorage(
        IAmazonS3 s3Client,
        IOptions<S3Options> settings,
        ILogger<MinioFileStorage> logger) 
    {
        _s3Client = s3Client;
        _settings = settings.Value;
        _logger = logger;
    }

    public string CreateFileKey(string fileName, FileStorageContext context, string identifier)
    {
        var folder = context switch
        {
            FileStorageContext.UserAvatar => "users/avatars",
            FileStorageContext.AudioRecording => "recordings",
            _ => throw new ArgumentOutOfRangeException(nameof(context), context, 
                $"Unhandled {nameof(FileStorageContext)} value: {context}")
        };

        var idSegment = !string.IsNullOrWhiteSpace(identifier) ? identifier : "global";
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
	
        if (string.IsNullOrEmpty(extension))
            _logger.LogWarning("File '{FileName}' has no extension — key will be extensionless", fileName);
	
        var uniqueName = Guid.NewGuid().ToString("N");

        return $"{folder}/{idSegment}/{uniqueName}{extension.ToLowerInvariant()}";
    }

    public string GetUrl(string fileKey)
    {
        throw new NotImplementedException();
    }

    public async Task UploadAsync(string fileKey, Stream fileStream, string contentType,
        CancellationToken cancellationToken)
    {
        var request = new PutObjectRequest
        {
            BucketName = _settings.BucketName,
            Key = fileKey,
            InputStream = fileStream,
            ContentType = contentType,
            AutoCloseStream = false,
            UseChunkEncoding = false
        };

        await _s3Client.PutObjectAsync(request, cancellationToken);
    }

    public Task DownloadAsync(string fileKey, IFormFile file)
    {
        throw new NotImplementedException();
    }


    public async Task DeleteAsync(string fileKey)
    {
        var request = new DeleteObjectRequest
        {
            BucketName = _settings.BucketName,
            Key = fileKey
        };

        await _s3Client.DeleteObjectAsync(request);
    }
}
