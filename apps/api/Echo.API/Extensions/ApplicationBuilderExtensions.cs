using Echo.API.Database;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Echo.API.Extensions;

public static class ApplicationBuilderExtensions
{
    public static async Task ApplyMigrationsAsync(this WebApplication app)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<EchoDbContext>();

        await dbContext.Database.MigrateAsync();
        await ConfigureSqliteJournalModeAsync(dbContext);
    }

    public static async Task ConfigureSqliteJournalModeAsync(
        EchoDbContext dbContext,
        CancellationToken ct = default)
    {
        if (!dbContext.Database.IsRelational() || !dbContext.Database.IsSqlite())
            return;

        if (dbContext.Database.GetDbConnection() is not SqliteConnection sqliteConnection)
            return;

        var connectionStringBuilder = new SqliteConnectionStringBuilder(sqliteConnection.ConnectionString);
        if (string.IsNullOrWhiteSpace(connectionStringBuilder.DataSource) ||
            string.Equals(connectionStringBuilder.DataSource, ":memory:", StringComparison.OrdinalIgnoreCase) ||
            connectionStringBuilder.Mode == SqliteOpenMode.Memory)
        {
            return;
        }

        await dbContext.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;", ct);
        await dbContext.Database.ExecuteSqlRawAsync("PRAGMA synchronous=NORMAL;", ct);
    }
}
