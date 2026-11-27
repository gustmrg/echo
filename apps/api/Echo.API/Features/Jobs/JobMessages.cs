using System.Text.Json;

namespace Echo.API.Features.Jobs;

public sealed record JobMessage(string JobId, string ClaimToken, string Kind,
    string? FileKey = null, string? FileName = null, string? ContentType = null,
    string? SourceText = null, string? Format = null, string? CorrelationId = null);
public sealed record JobResult(string JobId, string ClaimToken, string Kind, string Status,
    string? TranscriptionText = null, string? Error = null, bool Retryable = false,
    string? Content = null, string? Model = null, string? Provider = null, string? PromptVersion = null,
    string? CorrelationId = null);

public sealed class JobOutbox
{
    public Guid Id { get; set; }
    public required string Payload { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class RabbitOptions
{
    public string Url { get; set; } = "amqp://guest:guest@localhost:5672";
    public string JobQueue { get; set; } = "echo.jobs";
    public string ResultQueue { get; set; } = "echo.results";
    public int PollIntervalMs { get; set; } = 1000;
    public static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };
}
