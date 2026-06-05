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
            recording.CreatedAt,
            recording.UpdatedAt);
    }
}
