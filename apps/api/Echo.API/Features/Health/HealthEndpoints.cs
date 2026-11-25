using System.Text.Json;
using Echo.API.Database;
using Echo.API.Features.Jobs;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Echo.API.Features.Health;

public sealed class SqliteHealthCheck(EchoDbContext db) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var canConnect = await db.Database.CanConnectAsync(cancellationToken);
            return canConnect
                ? HealthCheckResult.Healthy("SQLite database is reachable.")
                : HealthCheckResult.Unhealthy("SQLite database is unreachable.");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("SQLite database check failed.", ex);
        }
    }
}

public sealed class RabbitHealthCheck(IRabbitHealthState healthState) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        var snapshot = healthState.GetSnapshot();
        var data = new Dictionary<string, object>();
        if (snapshot.LastConnectedAt is not null)
            data["last_connected_at"] = snapshot.LastConnectedAt.Value;
        if (!string.IsNullOrWhiteSpace(snapshot.LastError))
            data["last_error"] = snapshot.LastError;

        if (snapshot.IsConnected)
        {
            return Task.FromResult(HealthCheckResult.Healthy(
                "RabbitMQ connection is open.",
                data.Count > 0 ? data : null));
        }

        var description = string.IsNullOrWhiteSpace(snapshot.LastError)
            ? "RabbitMQ is not connected."
            : $"RabbitMQ is not connected: {snapshot.LastError}";

        return Task.FromResult(HealthCheckResult.Unhealthy(
            description,
            data: data.Count > 0 ? data : null));
    }
}

public static class HealthEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public static IEndpointRouteBuilder MapHealth(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapHealthChecks("/health/live", new HealthCheckOptions
        {
            Predicate = _ => false,
            ResponseWriter = WriteLiveResponse
        });

        endpoints.MapHealthChecks("/health/ready", new HealthCheckOptions
        {
            Predicate = registration => registration.Tags.Contains("ready"),
            ResponseWriter = WriteReadyResponse
        });

        return endpoints;
    }

    private static Task WriteLiveResponse(HttpContext context, HealthReport _)
    {
        context.Response.ContentType = "application/json; charset=utf-8";
        return context.Response.WriteAsync(
            JsonSerializer.Serialize(new { status = "healthy" }, JsonOptions));
    }

    private static Task WriteReadyResponse(HttpContext context, HealthReport report)
    {
        context.Response.ContentType = "application/json; charset=utf-8";
        var payload = new
        {
            status = report.Status.ToString().ToLowerInvariant(),
            checks = report.Entries.ToDictionary(
                entry => entry.Key,
                entry => new
                {
                    status = entry.Value.Status.ToString().ToLowerInvariant(),
                    description = entry.Value.Description,
                    durationMs = Math.Round(entry.Value.Duration.TotalMilliseconds, 2)
                })
        };

        return context.Response.WriteAsync(JsonSerializer.Serialize(payload, JsonOptions));
    }
}
