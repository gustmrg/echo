using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using Echo.API.Database;
using Echo.API.Features.Auth;
using Echo.API.Features.Jobs;
using Echo.API.Storage;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.DataProtection.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Echo.API.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddEchoAuth(configuration);
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

    public static IServiceCollection AddEchoAuth(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddOptions<AuthOptions>()
            .Bind(configuration.GetSection(AuthOptions.SectionName))
            .Validate(
                options => !options.Enabled || !string.IsNullOrWhiteSpace(options.Username),
                "Auth:Username is required when Auth:Enabled is true.")
            .Validate(
                options => !options.Enabled || options.SessionHours > 0,
                "Auth:SessionHours must be greater than zero when Auth:Enabled is true.")
            .Validate(
                options => !options.Enabled ||
                    (!string.IsNullOrWhiteSpace(options.PasswordHash)
                        ? PasswordVerifier.IsValidHashFormat(options.PasswordHash)
                        : !string.IsNullOrWhiteSpace(options.Password)),
                "Auth:Password or a valid Auth:PasswordHash (pbkdf2-sha256$<iterations>$<saltBase64>$<hashBase64>) is required when Auth:Enabled is true.")
            .ValidateOnStart();

        services.AddDataProtection()
            .SetApplicationName("Echo.API");

        services.AddOptions<KeyManagementOptions>()
            .Configure<IOptions<AuthOptions>, ILoggerFactory>((keyManagement, authOptionsAccessor, loggerFactory) =>
            {
                var keysPath = authOptionsAccessor.Value.DataProtectionKeysPath;
                if (!string.IsNullOrWhiteSpace(keysPath))
                {
                    Directory.CreateDirectory(keysPath);
                    keyManagement.XmlRepository = new FileSystemXmlRepository(new DirectoryInfo(keysPath), loggerFactory);
                }
            });

        services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
            .AddCookie();

        services.AddOptions<CookieAuthenticationOptions>(CookieAuthenticationDefaults.AuthenticationScheme)
            .Configure<IOptions<AuthOptions>, IServiceProvider>((options, authOptionsAccessor, sp) =>
            {
                var auth = authOptionsAccessor.Value;
                var isProduction = sp.GetService<IHostEnvironment>()?.IsProduction() ?? false;

                options.Cookie.Name = "echo.session";
                options.Cookie.HttpOnly = true;
                options.Cookie.SameSite = SameSiteMode.Lax;
                options.Cookie.SecurePolicy = auth.CookieSecure switch
                {
                    true => CookieSecurePolicy.Always,
                    false => CookieSecurePolicy.None,
                    null => isProduction ? CookieSecurePolicy.Always : CookieSecurePolicy.SameAsRequest,
                };
                options.SlidingExpiration = true;
                options.ExpireTimeSpan = TimeSpan.FromHours(auth.SessionHours > 0 ? auth.SessionHours : 168);
                options.Events.OnRedirectToLogin = context =>
                {
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    return Task.CompletedTask;
                };
                options.Events.OnRedirectToAccessDenied = context =>
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    return Task.CompletedTask;
                };
            });

        services.AddSingleton<IAuthorizationHandler, EchoAccessAuthorizationHandler>();
        services.AddAuthorizationBuilder()
            .AddPolicy(AuthOptions.PolicyName, policy =>
            {
                policy.AddAuthenticationSchemes(CookieAuthenticationDefaults.AuthenticationScheme);
                policy.AddRequirements(new EchoAccessRequirement());
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
