using Echo.API.Database;
using Microsoft.EntityFrameworkCore;

namespace Echo.API.Extensions;

public static class ApplicationBuilderExtensions
{
    public static async Task ApplyMigrationsAsync(this WebApplication app)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<EchoDbContext>();

        await dbContext.Database.MigrateAsync();
    }
}
