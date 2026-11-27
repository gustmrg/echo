using Echo.API.Enums;

namespace Echo.API.Entities;

public class RefinementJob
{
    public Guid Id { get; set; }
    public Guid RecordingId { get; set; }
    public required string RequestKey { get; set; }
    public required string Format { get; set; }
    public int TranscriptRevision { get; set; }
    public required string SourceText { get; set; }
    public JobStatus Status { get; set; } = JobStatus.Created;
    public string? Content { get; set; }
    public string? Model { get; set; }
    public string? Provider { get; set; }
    public string? PromptVersion { get; set; }
    public string? FailureReason { get; set; }
    public string? ClaimToken { get; set; }
    public string? CorrelationId { get; set; }
    public int AttemptCount { get; set; }
    public DateTime? NextAttemptAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public Recording Recording { get; set; } = null!;
}
