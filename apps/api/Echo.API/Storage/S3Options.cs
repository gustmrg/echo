namespace Echo.API.Storage;

public class S3Options
{
    public const string SectionName = "AWS:S3";
    
    public string BucketName { get; set; } = string.Empty;
    public string AccessKey { get; set; } = string.Empty; 
    public string SecretKey { get; set; } = string.Empty;
    public string? Region { get; set; }
    public int UrlExpirationMinutes { get; set; } = 48 * 60;
    public string? ServiceUrl { get; set; }
    public string? PublicUrl { get; set; }
    public bool ForcePathStyle { get; set; }
}