using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using Echo.Domain.Interfaces;
using Echo.Infrastructure.Options;
using Echo.Infrastructure.Repositories;
using Echo.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Echo.Infrastructure.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<S3Options>()
            .BindConfiguration(S3Options.SectionName)
            .ValidateDataAnnotations()
            .ValidateOnStart();

        services.AddSingleton<IAmazonS3>(sp =>
        {
            var s3Options = sp.GetRequiredService<IOptions<S3Options>>().Value;
            var config = new AmazonS3Config
            {
                // MinIO and similar S3-compatible providers typically require path-style bucket addressing.
                ForcePathStyle = s3Options.ForcePathStyle,
            };

            if (!string.IsNullOrWhiteSpace(s3Options.ServiceUrl))
            {
                // ServiceUrl is only needed for custom S3-compatible endpoints such as local MinIO.
                config.ServiceURL = s3Options.ServiceUrl;
            }
            else
            {
                // AWS S3 resolves against the configured region instead of a custom endpoint URL.
                config.RegionEndpoint = RegionEndpoint.GetBySystemName(s3Options.Region);
            }

            var credentials = new BasicAWSCredentials(s3Options.AccessKey, s3Options.SecretKey);
            return new AmazonS3Client(credentials, config);
        });

        services.AddDbContext<AppDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("DefaultConnection"))
                .UseSnakeCaseNamingConvention());

        services.AddScoped<IUnitOfWork>(sp => sp.GetRequiredService<AppDbContext>());
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IRecordingRepository, RecordingRepository>();
        
        services.AddSingleton<IFileStorageService, S3FileStorageService>();

        return services;
    }
}
