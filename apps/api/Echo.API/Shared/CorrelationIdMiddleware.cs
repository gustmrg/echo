namespace Echo.API.Shared;

public static class CorrelationId
{
    public const string HeaderName = "X-Correlation-Id";
    public const int MaxLength = 64;

    public static bool IsValid(string? value)
    {
        if (string.IsNullOrEmpty(value) || value.Length > MaxLength)
            return false;

        foreach (var ch in value)
        {
            var isAsciiLetterOrDigit =
                (ch is >= 'A' and <= 'Z') ||
                (ch is >= 'a' and <= 'z') ||
                (ch is >= '0' and <= '9');

            if (!isAsciiLetterOrDigit && ch is not ('.' or '_' or ':' or '-'))
                return false;
        }

        return true;
    }

    public static string Resolve(string? candidate) =>
        IsValid(candidate) ? candidate! : Guid.NewGuid().ToString();

    public static string? NormalizeOrNull(string? candidate) =>
        IsValid(candidate) ? candidate : null;
}

public sealed class CorrelationIdMiddleware(
    RequestDelegate next,
    ILogger<CorrelationIdMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        string? candidate = null;
        if (context.Request.Headers.TryGetValue(CorrelationId.HeaderName, out var values) &&
            values.Count == 1)
        {
            candidate = values[0];
        }

        var correlationId = CorrelationId.Resolve(candidate);
        context.TraceIdentifier = correlationId;
        context.Response.Headers[CorrelationId.HeaderName] = correlationId;
        context.Response.OnStarting(() =>
        {
            context.Response.Headers[CorrelationId.HeaderName] = correlationId;
            return Task.CompletedTask;
        });

        using var scope = logger.BeginScope(new Dictionary<string, object>
        {
            ["CorrelationId"] = correlationId
        });

        await next(context);
    }
}

public static class CorrelationIdExtensions
{
    public static IApplicationBuilder UseCorrelationId(this IApplicationBuilder app) =>
        app.UseMiddleware<CorrelationIdMiddleware>();
}
