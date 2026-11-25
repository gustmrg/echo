using Echo.API.Database;
using Echo.API.Extensions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Echo.API.Tests.Database;

public sealed class SqlitePragmaTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"echo-sqlite-pragmas-{Guid.NewGuid():N}");

    public SqlitePragmaTests()
    {
        Directory.CreateDirectory(_root);
    }

    [Fact]
    public async Task MigratedSqliteDatabase_EnablesWalSynchronousNormalBusyTimeoutAndForeignKeys()
    {
        var dbPath = Path.Combine(_root, "echo.db");
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Testing");
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = $"Data Source={dbPath}",
                ["Storage:Provider"] = "Local",
                ["Storage:Local:RootPath"] = Path.Combine(_root, "files")
            }));
        });

        // Boot the host so Program.cs runs ApplyMigrationsAsync.
        using var client = factory.CreateClient();

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<EchoDbContext>();
        await db.Database.OpenConnectionAsync();
        var connection = db.Database.GetDbConnection();

        Assert.Equal("wal", (await ReadPragmaAsync(connection, "PRAGMA journal_mode;"))?.ToString()?.ToLowerInvariant());
        Assert.Equal(1L, Convert.ToInt64(await ReadPragmaAsync(connection, "PRAGMA synchronous;")));
        Assert.Equal(5000L, Convert.ToInt64(await ReadPragmaAsync(connection, "PRAGMA busy_timeout;")));
        Assert.Equal(1L, Convert.ToInt64(await ReadPragmaAsync(connection, "PRAGMA foreign_keys;")));

        // Verify foreign_keys=ON actually rejects orphan rows.
        await using var invalidInsert = connection.CreateCommand();
        invalidInsert.CommandText = """
            INSERT INTO transcription_jobs (id, recording_id, status, created_at, retry_count, attempt_count)
            VALUES ($id, $recordingId, 'created', $createdAt, 0, 0);
            """;
        invalidInsert.Parameters.Add(new SqliteParameter("$id", Guid.CreateVersion7()));
        invalidInsert.Parameters.Add(new SqliteParameter("$recordingId", Guid.CreateVersion7()));
        invalidInsert.Parameters.Add(new SqliteParameter("$createdAt", DateTime.UtcNow));

        var ex = await Assert.ThrowsAsync<SqliteException>(() => invalidInsert.ExecuteNonQueryAsync());
        Assert.Equal(19, ex.SqliteErrorCode);
    }

    [Fact]
    public async Task ConfigureSqliteJournalModeAsync_SkipsInMemorySqlite()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();

        var options = new DbContextOptionsBuilder<EchoDbContext>()
            .UseSqlite(connection)
            .UseSnakeCaseNamingConvention()
            .AddInterceptors(new SqlitePragmaConnectionInterceptor())
            .Options;

        await using var db = new EchoDbContext(options);
        await db.Database.EnsureCreatedAsync();

        await ApplicationBuilderExtensions.ConfigureSqliteJournalModeAsync(db);

        Assert.Equal("memory", (await ReadPragmaAsync(connection, "PRAGMA journal_mode;"))?.ToString()?.ToLowerInvariant());
    }

    private static async Task<object?> ReadPragmaAsync(System.Data.Common.DbConnection connection, string sql)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        return await command.ExecuteScalarAsync();
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
    }
}
