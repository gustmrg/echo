using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Echo.API.Features.Auth;

public static class PasswordVerifier
{
    public const string Scheme = "pbkdf2-sha256";
    public const int DefaultIterations = 600_000;
    private const int SaltSize = 16;
    private const int KeySize = 32;

    public static string Hash(string password, int iterations = DefaultIterations)
    {
        ArgumentException.ThrowIfNullOrEmpty(password);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(iterations);

        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var derived = Rfc2898DeriveBytes.Pbkdf2(
            password,
            salt,
            iterations,
            HashAlgorithmName.SHA256,
            KeySize);

        return $"{Scheme}${iterations.ToString(CultureInfo.InvariantCulture)}${Convert.ToBase64String(salt)}${Convert.ToBase64String(derived)}";
    }

    public static bool IsValidHashFormat(string? encodedHash) =>
        TryParseHash(encodedHash, out _, out _, out _);

    public static bool Verify(string password, string encodedHash)
    {
        if (!TryParseHash(encodedHash, out var iterations, out var salt, out var expectedHash))
        {
            return false;
        }

        var actualHash = Rfc2898DeriveBytes.Pbkdf2(
            password,
            salt,
            iterations,
            HashAlgorithmName.SHA256,
            expectedHash.Length);

        return CryptographicOperations.FixedTimeEquals(actualHash, expectedHash);
    }

    public static bool FixedTimeEquals(string left, string right)
    {
        var leftHash = SHA256.HashData(Encoding.UTF8.GetBytes(left));
        var rightHash = SHA256.HashData(Encoding.UTF8.GetBytes(right));
        return CryptographicOperations.FixedTimeEquals(leftHash, rightHash);
    }

    private static bool TryParseHash(
        string? encodedHash,
        out int iterations,
        out byte[] salt,
        out byte[] hash)
    {
        iterations = 0;
        salt = [];
        hash = [];

        if (string.IsNullOrWhiteSpace(encodedHash))
        {
            return false;
        }

        var parts = encodedHash.Split('$');
        if (parts.Length != 4 || !string.Equals(parts[0], Scheme, StringComparison.Ordinal))
        {
            return false;
        }

        if (!int.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out iterations) || iterations <= 0)
        {
            return false;
        }

        if (!TryDecodeBase64(parts[2], out salt) || !TryDecodeBase64(parts[3], out hash))
        {
            return false;
        }

        return salt.Length > 0 && hash.Length > 0;
    }

    private static bool TryDecodeBase64(string value, out byte[] bytes)
    {
        bytes = [];
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var buffer = new byte[(value.Length * 3) / 4 + 3];
        if (!Convert.TryFromBase64String(value, buffer, out var written) || written == 0)
        {
            return false;
        }

        bytes = buffer[..written];
        return true;
    }
}
