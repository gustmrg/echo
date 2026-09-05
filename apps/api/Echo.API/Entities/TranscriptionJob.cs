using Echo.API.Enums;

namespace Echo.API.Entities;

public class TranscriptionJob
{
    public Guid Id { get; set; }
    public Guid RecordingId { get; set; }
    public JobStatus Status { get; set; } = JobStatus.Created;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public int RetryCount { get; set; }
    public int AttemptCount { get; set; }
    public string? ClaimToken { get; set; }
    public DateTime? NextAttemptAt { get; set; }
    public string? FailureReason { get; set; }

    public Recording Recording { get; set; } = null!;
}