using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;

namespace Echo.API.Storage;

public sealed class S3FileStorage : IFileStorage
{
    private readonly IAmazonS3 _s3Client;
    private readonly S3StorageOptions _settings;

    public S3FileStorage(IAmazonS3 s3Client, IOptions<StorageOptions> options)
    {
        _s3Client = s3Client;
        _settings = options.Value.S3;
    }

    public string CreateFileKey(string fileName, FileStorageContext context, string identifier) =>
        FileStorageKey.Create(fileName, context, identifier);

    public async Task UploadAsync(
        string fileKey,
        Stream fileStream,
        string contentType,
        CancellationToken cancellationToken)
    {
        var request = new PutObjectRequest
        {
            BucketName = _settings.BucketName,
            Key = fileKey,
            InputStream = fileStream,
            ContentType = contentType,
            AutoCloseStream = false,
            UseChunkEncoding = false,
        };

        await _s3Client.PutObjectAsync(request, cancellationToken);
    }

    public async Task DeleteAsync(string fileKey, CancellationToken cancellationToken = default)
    {
        var request = new DeleteObjectRequest
        {
            BucketName = _settings.BucketName,
            Key = fileKey,
        };

        await _s3Client.DeleteObjectAsync(request, cancellationToken);
    }
}
