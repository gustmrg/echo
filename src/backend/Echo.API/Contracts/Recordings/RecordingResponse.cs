using Echo.Domain.Entities;
using Echo.Domain.Enums;

namespace Echo.API.Contracts.Recordings;

public record RecordingResponse(
    Guid Id,
    RecordingStatus Status,
    string? FileExtension,
    int FileSizeBytes,
    string? S3Url,
    DateTime CreatedAt)
{
    public static RecordingResponse From(Recording recording) =>
        new(recording.Id, recording.Status, recording.FileExtension, recording.FileSizeBytes,
            recording.S3Url, recording.CreatedAt);
}
