using Echo.Domain.Common;
using Echo.Domain.Enums;

namespace Echo.Domain.Entities;

public class Recording
{
    private const int MaxFileSizeBytes = 1024 * 1024 * 25;
    private static readonly string[] AllowedFileTypes = ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"];
    private static readonly Dictionary<RecordingStatus, HashSet<RecordingStatus>> AllowedTransitions = new()
    {
        [RecordingStatus.Pending]      = [RecordingStatus.Uploaded, RecordingStatus.Failed],
        [RecordingStatus.Uploaded]     = [RecordingStatus.Transcribing, RecordingStatus.Failed],
        [RecordingStatus.Transcribing] = [RecordingStatus.Transcribed, RecordingStatus.Failed],
        [RecordingStatus.Transcribed]  = [],
        [RecordingStatus.Failed]       = [],
    };

    private Recording() { }

    public Guid Id { get; private set; }
    public Guid UserId { get; private set; }
    public RecordingStatus Status { get; private set; }
    public string? S3Key { get; private set; }
    public string? S3Url { get; private set; }
    public int FileSizeBytes { get; private set; }
    public string? FileExtension { get; private set; }
    public int DurationInSeconds { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime? UpdatedAt { get; private set; }
    public string? FailureReason { get; private set; }

    public static Result<Recording> Create(Guid userId, int fileSizeBytes, string fileExtension)
    {
        if (userId == Guid.Empty)
            return Result.Failure<Recording>(RecordingErrors.EmptyUserId);

        if (fileSizeBytes > MaxFileSizeBytes)
            return Result.Failure<Recording>(RecordingErrors.FileSizeExceeded);

        var extension = fileExtension.TrimStart('.').ToLowerInvariant();
        if (!AllowedFileTypes.Contains(extension))
            return Result.Failure<Recording>(RecordingErrors.UnsupportedFileType(extension, AllowedFileTypes));

        return Result.Success(new Recording
        {
            Id = Guid.CreateVersion7(),
            UserId = userId,
            FileSizeBytes = fileSizeBytes,
            FileExtension = extension,
            Status = RecordingStatus.Pending,
            CreatedAt = DateTime.UtcNow,
        });
    }

    public Result AttachS3Key(string s3Key, string s3Url)
    {
        var result = UpdateStatus(RecordingStatus.Uploaded);
        if (!result.IsSuccess) return result;

        S3Key = s3Key;
        S3Url = s3Url;
        UpdatedAt = DateTime.UtcNow;
        return result;
    }

    public Result MarkTranscribing()
    {
        var result = UpdateStatus(RecordingStatus.Transcribing);
        if (result.IsSuccess) UpdatedAt = DateTime.UtcNow;
        return result;
    }

    public Result MarkTranscribed(int durationInSeconds)
    {
        var result = UpdateStatus(RecordingStatus.Transcribed);
        if (!result.IsSuccess) return result;

        DurationInSeconds = durationInSeconds;
        UpdatedAt = DateTime.UtcNow;
        return result;
    }

    public Result MarkFailed(string reason)
    {
        var result = UpdateStatus(RecordingStatus.Failed);
        if (!result.IsSuccess) return result;

        FailureReason = reason;
        UpdatedAt = DateTime.UtcNow;
        return result;
    }

    private Result UpdateStatus(RecordingStatus next)
    {
        if (Status == next) return Result.Success();

        if (!AllowedTransitions[Status].Contains(next))
            return Result.Failure(RecordingErrors.InvalidStatusTransition(Id, Status, next));

        Status = next;
        return Result.Success();
    }
}