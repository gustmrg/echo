using Echo.Application.Options;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Options;

namespace Echo.API.Extensions;

public static class AuthenticationExtensions
{
    public static IServiceCollection AddAuth0Authentication(this IServiceCollection services)
    {
        var auth0Settings = services.BuildServiceProvider().GetRequiredService<IOptions<Auth0Options>>().Value;
        
        services.AddAuthentication(options =>
        {
            options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
            options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
        }).AddJwtBearer(options =>
        {
            options.Authority = $"https://{auth0Settings.Domain}";
            options.Audience = auth0Settings.Audience;
        });
        
        return services;
    }
}
