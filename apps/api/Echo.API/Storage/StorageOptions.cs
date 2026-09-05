namespace Echo.API.Storage;

public sealed class StorageOptions
{
    public const string SectionName = "Storage";

    public StorageProvider Provider { get; set; } = StorageProvider.Local;
    public LocalStorageOptions Local { get; set; } = new();
    public S3StorageOptions S3 { get; set; } = new();
}

public sealed class LocalStorageOptions
{
    public string RootPath { get; set; } = "files";
}

public sealed class S3StorageOptions
{
    public string? Endpoint { get; set; }
    public bool ForcePathStyle { get; set; }
    public string BucketName { get; set; } = string.Empty;
    public string Region { get; set; } = "us-east-1";
}

public enum StorageProvider
{
    Local,
    S3,
}
