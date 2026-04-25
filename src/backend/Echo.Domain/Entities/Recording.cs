using Echo.Domain.Common;
using Echo.Domain.Enums;

namespace Echo.Domain.Entities;

public class Recording
{
    private static readonly Dictionary<RecordingStatus, HashSet<RecordingStatus>> AllowedTransitions = new()
    {
        [RecordingStatus.Pending] = [RecordingStatus.Uploaded, RecordingStatus.Failed],
        [RecordingStatus.Uploaded] = [RecordingStatus.Transcribing,  RecordingStatus.Failed],
        [RecordingStatus.Transcribing] = [RecordingStatus.Transcribed, RecordingStatus.Failed],
        [RecordingStatus.Transcribed] = [],
        [RecordingStatus.Failed] = [],
    };
        
    private Recording() { }
    
    public Guid Id { get; private set; }
    public Guid UserId { get; set; }
    public RecordingStatus Status { get; private set; }
    public string? S3Key { get; private set; }
    public string? S3Url { get; set; }
    public int DurationInSeconds { get; set; }
    public int FileSizeBytes { get; set; }
    public string? MimeType { get; set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime? UpdatedAt { get; private set; }
    public string? FailureReason { get; private set; }

    public static Recording Create()
    {
        return new Recording
        {
            Id = Guid.CreateVersion7(),
            Status = RecordingStatus.Pending,
            CreatedAt = DateTime.UtcNow,
        };
    }

    public void AttachS3Key(string s3Key)
    {
        UpdateStatus(RecordingStatus.Uploaded);
        UpdatedAt = DateTime.UtcNow;
        S3Key = s3Key;
    }
    
    public Result MarkTranscribing()
    {
        var result = UpdateStatus(RecordingStatus.Transcribing);
        if (result.IsSuccess) UpdatedAt = DateTime.UtcNow;
        return result;
    }

    public Result MarkTranscribed()
    {
        var result = UpdateStatus(RecordingStatus.Transcribed);
        if (result.IsSuccess) UpdatedAt = DateTime.UtcNow;
        return result;
    }

    public Result MarkFailed(string reason)
    {
        var result = UpdateStatus(RecordingStatus.Failed);

        if (!result.IsSuccess) return result;
        UpdatedAt = DateTime.UtcNow;
        FailureReason = reason;

        return result;
    }
    
    private Result UpdateStatus(RecordingStatus next)
    {
        if (Status == next) return Result.Success();
        
        if (!AllowedTransitions[Status].Contains(next))
            return Result.Failure($"Cannot transition recording {Id} from {Status} to {next}");
        
        Status = next;
        return Result.Success();
    }
}