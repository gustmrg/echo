using Echo.API.Entities;

namespace Echo.API.Features.Recordings;

internal sealed record RecordingResponse(
    Guid Id,
    string? Title,
    string Status,
    string FileName,
    long FileSizeBytes,
    string? ContentType,
    string? TranscribedText,
    string? EditedText,
    int TranscriptRevision,
    string? FailureReason,
    int AttemptCount,
    int RetryCount,
    DateTime CreatedAt,
    DateTime? UpdatedAt)
{
    public static RecordingResponse FromRecording(Recording recording)
    {
        return new RecordingResponse(
            recording.Id,
            recording.Title,
            recording.Status.ToString().ToLowerInvariant(),
            recording.FileName,
            recording.FileSizeBytes,
            recording.ContentType,
            recording.TranscribedText,
            recording.EditedText,
            recording.TranscriptRevision,
            recording.TranscriptionJob?.FailureReason,
            recording.TranscriptionJob?.AttemptCount ?? 0,
            recording.TranscriptionJob?.RetryCount ?? 0,
            recording.CreatedAt,
            recording.UpdatedAt);
    }
}

public sealed record RecordingSummaryResponse(
    Guid Id,
    string? Title,
    string Status,
    string FileName,
    long FileSizeBytes,
    string? ContentType,
    int TranscriptRevision,
    string? FailureReason,
    int AttemptCount,
    int RetryCount,
    DateTime CreatedAt,
    DateTime? UpdatedAt);
