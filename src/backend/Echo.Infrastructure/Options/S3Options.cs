using System.ComponentModel.DataAnnotations;

namespace Echo.Infrastructure.Options;

/// <summary>
/// Configuration for the S3 file storage service.
/// </summary>
public class S3Options : IValidatableObject
{
    public const string SectionName = "AWS:S3";
    
    [Required, MinLength(1)] public string BucketName { get; set; } = string.Empty;
    [Required, MinLength(1)] public string AccessKey { get; set; } = string.Empty;
    [Required, MinLength(1)] public string SecretKey { get; set; } = string.Empty;
    public string? Region { get; set; }

    [Range(1, int.MaxValue)]
    public int UrlExpirationMinutes { get; set; } = 48 * 60;

    [Url]
    public string? ServiceUrl { get; set; }

    [Url]
    public string? PublicUrl { get; set; }

    public bool ForcePathStyle { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        var usesCustomEndpoint = !string.IsNullOrWhiteSpace(ServiceUrl);

        if (!usesCustomEndpoint && string.IsNullOrWhiteSpace(Region))
        {
            yield return new ValidationResult(
                $"{nameof(Region)} is required when {nameof(ServiceUrl)} is not configured.",
                [nameof(Region), nameof(ServiceUrl)]);
        }

        if (usesCustomEndpoint && !ForcePathStyle)
        {
            yield return new ValidationResult(
                $"{nameof(ForcePathStyle)} must be enabled when {nameof(ServiceUrl)} is configured for an S3-compatible endpoint such as MinIO.",
                [nameof(ForcePathStyle), nameof(ServiceUrl)]);
        }
    }
}
