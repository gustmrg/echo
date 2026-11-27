using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Extensions.Options;

namespace Echo.API.Features.Auth;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuth(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("auth")
            .WithTags("Auth")
            .AllowAnonymous();

        group.MapGet("status", GetStatus)
            .WithName("GetAuthStatus")
            .WithSummary("Get current authentication status")
            .Produces<AuthStatusResponse>(StatusCodes.Status200OK);

        group.MapPost("login", Login)
            .WithName("Login")
            .WithSummary("Sign in with username and password")
            .Produces<LoginResponse>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status401Unauthorized)
            .Produces(StatusCodes.Status404NotFound);

        group.MapPost("logout", (Delegate)Logout)
            .WithName("Logout")
            .WithSummary("Sign out and clear the session cookie")
            .Produces(StatusCodes.Status204NoContent);

        return endpoints;
    }

    private static IResult GetStatus(IOptions<AuthOptions> options, HttpContext context)
    {
        var auth = options.Value;
        if (!auth.Enabled)
        {
            return Results.Ok(new AuthStatusResponse(false, false, null));
        }

        var authenticated = context.User.Identity?.IsAuthenticated == true;
        var username = authenticated ? context.User.Identity?.Name : null;
        return Results.Ok(new AuthStatusResponse(true, authenticated, username));
    }

    private static async Task<IResult> Login(
        LoginRequest request,
        IOptions<AuthOptions> options,
        HttpContext context)
    {
        var auth = options.Value;
        if (!auth.Enabled)
        {
            return Results.NotFound(new { detail = "Authentication is disabled." });
        }

        var providedUsername = request.Username ?? string.Empty;
        var providedPassword = request.Password ?? string.Empty;

        var usernameMatches = PasswordVerifier.FixedTimeEquals(providedUsername, auth.Username);
        var passwordMatches = !string.IsNullOrWhiteSpace(auth.PasswordHash)
            ? PasswordVerifier.Verify(providedPassword, auth.PasswordHash)
            : !string.IsNullOrWhiteSpace(auth.Password) &&
              PasswordVerifier.FixedTimeEquals(providedPassword, auth.Password);

        if (!usernameMatches || !passwordMatches)
        {
            return Results.Unauthorized();
        }

        var claims = new[] { new Claim(ClaimTypes.Name, auth.Username) };
        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        var principal = new ClaimsPrincipal(identity);

        await context.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            principal,
            new AuthenticationProperties
            {
                IsPersistent = true,
                AllowRefresh = true,
            });

        return Results.Ok(new LoginResponse(true, auth.Username));
    }

    private static async Task<IResult> Logout(HttpContext context)
    {
        await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        return Results.NoContent();
    }
}

public sealed record AuthStatusResponse(bool AuthEnabled, bool Authenticated, string? Username);

public sealed record LoginRequest(string? Username, string? Password);

public sealed record LoginResponse(bool Authenticated, string Username);
