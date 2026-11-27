using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Echo.API.Features.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace Echo.API.Tests.Features;

public sealed class AuthTests
{
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task SessionCookieAuth_ProtectsEndpointsAndSupportsLoginLogout(bool usePasswordHash)
    {
        const string username = "echo-owner";
        const string password = "correct-horse-battery-staple";

        using var host = new AuthTestHost(new Dictionary<string, string?>
        {
            ["Auth:Enabled"] = "true",
            ["Auth:Username"] = username,
            ["Auth:Password"] = usePasswordHash ? null : password,
            ["Auth:PasswordHash"] = usePasswordHash ? PasswordVerifier.Hash(password, iterations: 10_000) : null,
            ["Auth:SessionHours"] = "24",
            ["Auth:DataProtectionKeysPath"] = null,
        });

        using var client = host.CreateClient();

        // 1. Initial status reports auth enabled and unauthenticated.
        var initialStatus = await client.GetAsync("/api/auth/status");
        Assert.Equal(HttpStatusCode.OK, initialStatus.StatusCode);
        var initialBody = await initialStatus.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(initialBody.GetProperty("authEnabled").GetBoolean());
        Assert.False(initialBody.GetProperty("authenticated").GetBoolean());
        Assert.Equal(JsonValueKind.Null, initialBody.GetProperty("username").ValueKind);

        // 2. Unauthenticated requests to protected endpoints return 401 with no redirect.
        var getRecordingsUnauth = await client.GetAsync("/api/recordings");
        Assert.Equal(HttpStatusCode.Unauthorized, getRecordingsUnauth.StatusCode);
        Assert.Null(getRecordingsUnauth.Headers.Location);

        var postRecordingUnauth = await UploadAsync(client, Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.Unauthorized, postRecordingUnauth.StatusCode);
        Assert.Null(postRecordingUnauth.Headers.Location);

        var getRefinementsUnauth = await client.GetAsync($"/api/recordings/{Guid.NewGuid()}/refinements");
        Assert.Equal(HttpStatusCode.Unauthorized, getRefinementsUnauth.StatusCode);
        Assert.Null(getRefinementsUnauth.Headers.Location);

        // 3. Invalid credentials return 401.
        var wrongPassword = await client.PostAsJsonAsync("/api/auth/login", new { username, password = "wrong-password" });
        Assert.Equal(HttpStatusCode.Unauthorized, wrongPassword.StatusCode);

        var wrongUsername = await client.PostAsJsonAsync("/api/auth/login", new { username = "other-user", password });
        Assert.Equal(HttpStatusCode.Unauthorized, wrongUsername.StatusCode);

        // 4. Valid login sets HttpOnly cookie and returns authenticated payload.
        var loginResponse = await client.PostAsJsonAsync("/api/auth/login", new { username, password });
        Assert.Equal(HttpStatusCode.OK, loginResponse.StatusCode);
        var loginBody = await loginResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(loginBody.GetProperty("authenticated").GetBoolean());
        Assert.Equal(username, loginBody.GetProperty("username").GetString());

        Assert.True(loginResponse.Headers.TryGetValues("Set-Cookie", out var setCookies));
        var sessionCookie = Assert.Single(setCookies, c => c.StartsWith("echo.session=", StringComparison.Ordinal));
        Assert.Contains("httponly", sessionCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=lax", sessionCookie, StringComparison.OrdinalIgnoreCase);

        // 5. Authenticated requests succeed.
        var authenticatedStatus = await client.GetAsync("/api/auth/status");
        Assert.Equal(HttpStatusCode.OK, authenticatedStatus.StatusCode);
        var authenticatedBody = await authenticatedStatus.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(authenticatedBody.GetProperty("authEnabled").GetBoolean());
        Assert.True(authenticatedBody.GetProperty("authenticated").GetBoolean());
        Assert.Equal(username, authenticatedBody.GetProperty("username").GetString());

        var getRecordingsAuth = await client.GetAsync("/api/recordings");
        Assert.Equal(HttpStatusCode.OK, getRecordingsAuth.StatusCode);

        // 6. Logout clears session cookie and revokes access.
        var logoutResponse = await client.PostAsync("/api/auth/logout", content: null);
        Assert.Equal(HttpStatusCode.NoContent, logoutResponse.StatusCode);

        var postLogoutRecordings = await client.GetAsync("/api/recordings");
        Assert.Equal(HttpStatusCode.Unauthorized, postLogoutRecordings.StatusCode);

        var postLogoutStatus = await client.GetAsync("/api/auth/status");
        var postLogoutBody = await postLogoutStatus.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(postLogoutBody.GetProperty("authenticated").GetBoolean());
    }

    [Fact]
    public async Task AuthDisabled_StatusReportsDisabledAndLoginReturnsNotFound()
    {
        using var host = new AuthTestHost(new Dictionary<string, string?>
        {
            ["Auth:Enabled"] = "false",
        });

        using var client = host.CreateClient();

        var status = await client.GetAsync("/api/auth/status");
        Assert.Equal(HttpStatusCode.OK, status.StatusCode);
        var body = await status.Content.ReadFromJsonAsync<JsonElement>();
        Assert.False(body.GetProperty("authEnabled").GetBoolean());
        Assert.False(body.GetProperty("authenticated").GetBoolean());
        Assert.Equal(JsonValueKind.Null, body.GetProperty("username").ValueKind);

        var login = await client.PostAsJsonAsync("/api/auth/login", new { username = "admin", password = "secret" });
        Assert.Equal(HttpStatusCode.NotFound, login.StatusCode);

        var recordings = await client.GetAsync("/api/recordings");
        Assert.Equal(HttpStatusCode.OK, recordings.StatusCode);
    }

    [Fact]
    public async Task DataProtectionKeysPath_PersistsKeysToDirectory()
    {
        var keysDir = Path.Combine(Path.GetTempPath(), $"echo-dp-keys-{Guid.NewGuid():N}");
        try
        {
            using var host = new AuthTestHost(new Dictionary<string, string?>
            {
                ["Auth:Enabled"] = "true",
                ["Auth:Username"] = "admin",
                ["Auth:Password"] = "secret",
                ["Auth:DataProtectionKeysPath"] = keysDir,
            });

            using var client = host.CreateClient();
            var login = await client.PostAsJsonAsync("/api/auth/login", new { username = "admin", password = "secret" });
            Assert.Equal(HttpStatusCode.OK, login.StatusCode);
            Assert.True(Directory.Exists(keysDir));
            Assert.NotEmpty(Directory.GetFiles(keysDir, "key-*.xml"));
        }
        finally
        {
            if (Directory.Exists(keysDir))
            {
                Directory.Delete(keysDir, true);
            }
        }
    }

    [Theory]
    [InlineData("", "secret", null, "168")]
    [InlineData("admin", "", null, "168")]
    [InlineData("admin", null, "not-a-valid-hash", "168")]
    [InlineData("admin", "secret", null, "0")]
    public void AuthOptions_ValidationRejectsInvalidEnabledConfiguration(
        string username,
        string? password,
        string? passwordHash,
        string sessionHours)
    {
        using var host = new AuthTestHost(new Dictionary<string, string?>
        {
            ["Auth:Enabled"] = "true",
            ["Auth:Username"] = username,
            ["Auth:Password"] = password,
            ["Auth:PasswordHash"] = passwordHash,
            ["Auth:SessionHours"] = sessionHours,
        });

        Assert.Throws<OptionsValidationException>(() => host.CreateClient());
    }

    [Fact]
    public void PasswordVerifier_HashesAndVerifiesCorrectly()
    {
        var hash = PasswordVerifier.Hash("my-secret-passphrase", iterations: 10_000);
        Assert.StartsWith("pbkdf2-sha256$10000$", hash, StringComparison.Ordinal);
        Assert.True(PasswordVerifier.IsValidHashFormat(hash));
        Assert.True(PasswordVerifier.Verify("my-secret-passphrase", hash));
        Assert.False(PasswordVerifier.Verify("wrong-passphrase", hash));
        Assert.False(PasswordVerifier.IsValidHashFormat("bcrypt$10$abc$def"));
        Assert.False(PasswordVerifier.IsValidHashFormat("pbkdf2-sha256$0$abc$def"));
    }

    private static async Task<HttpResponseMessage> UploadAsync(HttpClient client, string idempotencyKey)
    {
        using var form = new MultipartFormDataContent();
        var bytes = new ByteArrayContent([0x1A, 0x45, 0xDF, 0xA3, 0x01]);
        bytes.Headers.ContentType = new MediaTypeHeaderValue("audio/webm");
        form.Add(bytes, "file", "audio.webm");
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/recordings") { Content = form };
        request.Headers.Add("Idempotency-Key", idempotencyKey);
        return await client.SendAsync(request);
    }

    private sealed class AuthTestHost : IDisposable
    {
        private readonly string root = Path.Combine(Path.GetTempPath(), $"echo-auth-tests-{Guid.NewGuid():N}");
        private readonly WebApplicationFactory<Program> factory;

        public AuthTestHost(Dictionary<string, string?> authOverrides)
        {
            Directory.CreateDirectory(root);
            var settings = new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = $"Data Source={Path.Combine(root, "echo.db")}",
                ["Storage:Provider"] = "Local",
                ["Storage:Local:RootPath"] = Path.Combine(root, "files"),
            };

            foreach (var (key, value) in authOverrides)
            {
                settings[key] = value;
            }

            factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            {
                builder.UseEnvironment("Testing");
                builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(settings));
            });
        }

        public HttpClient CreateClient() =>
            factory.CreateClient(new WebApplicationFactoryClientOptions
            {
                BaseAddress = new Uri("https://localhost"),
                AllowAutoRedirect = false,
                HandleCookies = true,
            });

        public void Dispose()
        {
            factory.Dispose();
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
            if (Directory.Exists(root))
            {
                Directory.Delete(root, true);
            }
        }
    }
}
