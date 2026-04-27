using System.Net;
using Amazon.S3;
using Amazon.S3.Model;
using Echo.Domain.Interfaces;
using Echo.Infrastructure.Options;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Echo.Infrastructure.Services;

public class S3FileStorageService : IFileStorageService
{
    private readonly IAmazonS3 _s3Client;
    private readonly S3Options _settings;
    private readonly ILogger<S3FileStorageService> _logger;

    public S3FileStorageService(IAmazonS3 s3Client, IOptions<S3Options> settings, ILogger<S3FileStorageService> logger)
    {
        _s3Client = s3Client;
        _logger = logger;
        _settings = settings.Value;
    }
    
    public string? GetFileUrl(string? fileKey)
    {
        if (string.IsNullOrEmpty(fileKey)) return null;

        var request = new GetPreSignedUrlRequest
        {
            BucketName = _settings.BucketName,
            Key = fileKey,
            Expires = DateTime.UtcNow.AddMinutes(_settings.UrlExpirationMinutes),
        };

        return _s3Client.GetPreSignedURL(request);
    }

    public async Task<string> UploadFileAsync(Stream fileStream, string fileName, string contentType, FileStorageContext context,
        string? identifier = null)
    {
        var fileKey = GenerateFileKey(fileName, context, identifier);

        var request = new PutObjectRequest
        {
            BucketName = _settings.BucketName,
            Key = fileKey,
            InputStream = fileStream,
            ContentType = contentType,
            AutoCloseStream = false
        };

        await _s3Client.PutObjectAsync(request);

        return fileKey;
    }

    public async Task DeleteFileAsync(string fileKey)
    {
        if (string.IsNullOrEmpty(fileKey)) return;

        try
        {
            var request = new DeleteObjectRequest
            {
                BucketName = _settings.BucketName,
                Key = fileKey
            };

            await _s3Client.DeleteObjectAsync(request);
        }
        catch (AmazonS3Exception ex)
        {
            _logger.LogWarning(ex, "Failed to delete S3 object {FileKey} from bucket {Bucket}", 
                fileKey, _settings.BucketName);
        }
    }

    public async Task<bool> FileExistsAsync(string? fileKey)
    {
        if (string.IsNullOrEmpty(fileKey)) return false;

        try
        {
            var request = new GetObjectMetadataRequest
            {
                BucketName = _settings.BucketName,
                Key = fileKey
            };

            await _s3Client.GetObjectMetadataAsync(request);
            return true;
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return false;
        }
    }
    
    private string GenerateFileKey(string fileName, FileStorageContext context, string? identifier)
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
}
