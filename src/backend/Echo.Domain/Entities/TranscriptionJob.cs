using Echo.Domain.Common;

namespace Echo.Domain.Entities;

public class TranscriptionJob
{
    private TranscriptionJob() { }
    
    public Guid Id { get; private set; }
    public Guid RecordingId { get; private set; }
    public string RawText { get; private set; } = string.Empty;
    public DateTime CreatedAt { get; init; } 
    public DateTime? UpdatedAt { get; set; }

    public static TranscriptionJob Create(Guid recordingId)
    {
        return new TranscriptionJob
        {
            Id = Guid.CreateVersion7(),
            RecordingId =  recordingId,
            CreatedAt = DateTime.UtcNow,
        };
    }
}