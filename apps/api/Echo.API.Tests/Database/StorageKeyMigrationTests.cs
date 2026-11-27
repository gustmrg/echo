using Echo.API.Database;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Echo.API.Tests.Database;

public sealed class StorageKeyMigrationTests : IDisposable
{
    private readonly string _databasePath = Path.Combine(
        Path.GetTempPath(),
        $"echo-migration-{Guid.NewGuid():N}.db");

    [Fact]
    public async Task Migration_RenamesColumnAndPreservesExistingKey()
    {
        var options = new DbContextOptionsBuilder<EchoDbContext>()
            .UseSqlite($"Data Source={_databasePath}")
            .UseSnakeCaseNamingConvention()
            .Options;

        await using var dbContext = new EchoDbContext(options);
        var migrator = dbContext.Database.GetService<IMigrator>();
        await migrator.MigrateAsync(
            "20260605022109_ChangeTranscriptionJobRelationship",
            CancellationToken.None);

        const string expectedKey = "recordings/existing/audio.webm";
        await dbContext.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO recordings (id, status, file_name, file_size_bytes, s3_key, created_at)
            VALUES ({Guid.CreateVersion7()}, {"pending"}, {"audio.webm"}, {123L}, {expectedKey}, {DateTime.UtcNow})
            """, CancellationToken.None);

        await migrator.MigrateAsync(cancellationToken: CancellationToken.None);

        var connection = dbContext.Database.GetDbConnection();
        await connection.OpenAsync(CancellationToken.None);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT storage_key FROM recordings LIMIT 1";

        Assert.Equal(expectedKey, await command.ExecuteScalarAsync(CancellationToken.None));
    }

    public void Dispose()
    {
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        File.Delete(_databasePath);
        File.Delete($"{_databasePath}-shm");
        File.Delete($"{_databasePath}-wal");
    }
}
