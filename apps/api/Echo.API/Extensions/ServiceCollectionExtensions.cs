using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using Echo.API.Database;
using Echo.API.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Echo.API.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<S3Options>()
            .BindConfiguration(S3Options.SectionName)
            .ValidateDataAnnotations()
            .ValidateOnStart();

        // TODO: Improve logic to use MinIO only in dev environment
        services.AddSingleton<IAmazonS3>(sp =>
        {
            var s3Options = sp.GetRequiredService<IOptions<S3Options>>().Value;
            var config = new AmazonS3Config
            {
                ForcePathStyle = s3Options.ForcePathStyle,
                RequestChecksumCalculation = RequestChecksumCalculation.WHEN_REQUIRED,
                ResponseChecksumValidation = ResponseChecksumValidation.WHEN_REQUIRED,
            };

            if (!string.IsNullOrWhiteSpace(s3Options.ServiceUrl))
            {
                // ServiceUrl is only needed for custom S3-compatible endpoints such as local MinIO.
                config.ServiceURL = s3Options.ServiceUrl;
                config.AuthenticationRegion = s3Options.Region;
            }
            else
            {
                config.RegionEndpoint = RegionEndpoint.GetBySystemName(s3Options.Region);
            }

            var credentials = new BasicAWSCredentials(s3Options.AccessKey, s3Options.SecretKey);
            return new AmazonS3Client(credentials, config);
        });
        
        services.AddDbContext<EchoDbContext>(options =>
        {
            options.UseSqlite(configuration.GetConnectionString("DefaultConnection"))
                .UseSnakeCaseNamingConvention();
        });
        
        services.AddSingleton<IFileStorage, MinioFileStorage>();

        return services;
    }
}
