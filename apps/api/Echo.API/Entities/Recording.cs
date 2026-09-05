using Echo.API.Enums;

namespace Echo.API.Entities;

public class Recording
{
    public Guid Id { get; set; }
    public string? Title { get; set; }
    public RecordingStatus Status { get; set; }
    public required string FileName { get; set; }
    public long FileSizeBytes { get; set; }
    public string? ContentType { get; set; }
    public string? StorageKey { get; set; }
    public string? TranscribedText { get; set; }
    public string? EditedText { get; set; }
    public int TranscriptRevision { get; set; }
    public string? UploadKey { get; set; }
    public string? UploadHash { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public TranscriptionJob TranscriptionJob { get; set; } = new();
}
