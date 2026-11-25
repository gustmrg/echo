namespace Echo.API.Features.Auth;

public sealed class AuthOptions
{
    public const string SectionName = "Auth";
    public const string PolicyName = "EchoAccess";

    public bool Enabled { get; set; }
    public string Username { get; set; } = "admin";
    public string? Password { get; set; }
    public string? PasswordHash { get; set; }
    public int SessionHours { get; set; } = 168;
    public bool? CookieSecure { get; set; }
    public string? DataProtectionKeysPath { get; set; }
}
