using System.ComponentModel.DataAnnotations;

namespace Echo.Application.Settings;

public class Auth0Settings
{
    public const string SectionName = "Auth0";
    
    [Required, MinLength(1)] public string Domain { get; init; } = null!;
    [Required, MinLength(1)] public string Audience { get; init; } = null!;
}