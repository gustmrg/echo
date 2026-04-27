using System.ComponentModel.DataAnnotations;

namespace Echo.Infrastructure.Options;

/// <summary>
/// Configuration for the S3 file storage service.
/// </summary>
public class S3Options
{
    public const string SectionName = "AWS:S3";
    
    [Required, MinLength(1)] public string BucketName { get; set; } = string.Empty;
    [Required, MinLength(1)] public string Region { get; set; } = string.Empty;
    [Required, MinLength(1)] public string AccessKey { get; set; } = string.Empty;
    [Required, MinLength(1)] public string SecretKey { get; set; } = string.Empty;

    [Range(1, int.MaxValue)]
    public int UrlExpirationMinutes { get; set; } = 48 * 60;

    [Url]
    public string? ServiceUrl { get; set; }

    [Url]
    public string? PublicUrl { get; set; }

    public bool ForcePathStyle { get; set; }
}
