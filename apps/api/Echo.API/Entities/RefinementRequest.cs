namespace Echo.API.Entities;

// Maps every client request to its result, including reuse of an active/cached job.
public class RefinementRequest
{
    public Guid RecordingId { get; set; }
    public required string RequestKey { get; set; }
    public Guid JobId { get; set; }
    public required string Format { get; set; }
    public int TranscriptRevision { get; set; }
    public bool Regenerate { get; set; }
    public RefinementJob Job { get; set; } = null!;
}
