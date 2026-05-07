using System.Security.Principal;
using Echo.API.Enums;

namespace Echo.API.Entities;

public class TranscriptionJob
{
    public TranscriptionJob()
    {
        
    }

    public Guid Id { get; set; }
    public Guid RecordingId { get; set; }
    public string? RawText { get; set; }
    public TranscriptionJobStatus Status { get; set; } = TranscriptionJobStatus.Created;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public int RetryCount { get; set; }
    public string? FailureReason { get; set; }

    public Recording Recording { get; set; }
}