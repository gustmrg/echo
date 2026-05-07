using Echo.API.Enums;

namespace Echo.API.Entities;

public class Recording
{
    public Recording()
    {
        
    }
    
    public Guid Id { get; set; }
    public string? Title { get; set; }
    public RecordingStatus Status { get; set; }
    public string FileName { get; set; }
    public int FileSizeBytes { get; set; }
    public string? ContentType { get; set; }
    public string? S3Key { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
}