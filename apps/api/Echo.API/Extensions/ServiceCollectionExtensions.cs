using Echo.API.Features.Jobs;
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
        services.AddFileStorage(configuration);
        services.AddOptions<RabbitOptions>().Bind(configuration.GetSection("RabbitMQ"))
            .Validate(o => Uri.TryCreate(o.Url, UriKind.Absolute, out var uri) && uri.Scheme is "amqp" or "amqps", "RabbitMQ URL must be amqp(s).")
            .Validate(o => o.PollIntervalMs > 0 && !string.IsNullOrWhiteSpace(o.JobQueue) && !string.IsNullOrWhiteSpace(o.ResultQueue) && o.JobQueue != o.ResultQueue, "Invalid RabbitMQ queues or poll interval.")
            .ValidateOnStart();
        services.AddHostedService<RabbitJobService>();
        
        services.AddDbContext<EchoDbContext>(options =>
        {
            options.UseSqlite(configuration.GetConnectionString("DefaultConnection"))
                .UseSnakeCaseNamingConvention();
        });
        
        return services;
    }

    public static IServiceCollection AddFileStorage(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddOptions<StorageOptions>()
            .Bind(configuration.GetSection(StorageOptions.SectionName))
            .Validate(options => Enum.IsDefined(options.Provider), "Storage provider must be Local or S3.")
            .Validate(
                options => options.Provider != StorageProvider.Local ||
                    !string.IsNullOrWhiteSpace(options.Local.RootPath),
                "Storage:Local:RootPath is required when Storage:Provider is Local.")
            .Validate(
                options => options.Provider != StorageProvider.S3 ||
                    !string.IsNullOrWhiteSpace(options.S3.BucketName),
                "Storage:S3:BucketName is required when Storage:Provider is S3.")
            .Validate(
                options => options.Provider != StorageProvider.S3 ||
                    !string.IsNullOrWhiteSpace(options.S3.Region),
                "Storage:S3:Region is required when Storage:Provider is S3.")
            .ValidateOnStart();

        services.AddSingleton<IAmazonS3>(sp =>
        {
            var options = sp.GetRequiredService<IOptions<StorageOptions>>().Value.S3;
            var s3Config = new AmazonS3Config
            {
                RegionEndpoint = RegionEndpoint.GetBySystemName(options.Region),
                RequestChecksumCalculation = RequestChecksumCalculation.WHEN_REQUIRED,
                ResponseChecksumValidation = ResponseChecksumValidation.WHEN_REQUIRED,
            };

            if (!string.IsNullOrWhiteSpace(options.Endpoint))
            {
                s3Config.ServiceURL = options.Endpoint;
                s3Config.AuthenticationRegion = options.Region;
            }
            s3Config.ForcePathStyle = options.ForcePathStyle;
            return new AmazonS3Client(s3Config);
        });

        services.AddSingleton<IFileStorage>(sp =>
        {
            var provider = sp.GetRequiredService<IOptions<StorageOptions>>().Value.Provider;
            return provider switch
            {
                StorageProvider.Local => ActivatorUtilities.CreateInstance<LocalFileStorage>(sp),
                StorageProvider.S3 => ActivatorUtilities.CreateInstance<S3FileStorage>(sp),
                _ => throw new InvalidOperationException($"Unsupported storage provider '{provider}'."),
            };
        });

        return services;
    }
}
