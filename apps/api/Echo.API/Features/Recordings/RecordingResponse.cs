using System.Globalization;
using Echo.API.Entities;

namespace Echo.API.Features.Recordings;

internal sealed record RecordingResponse(
    Guid Id,
    string? Title,
    string Status,
    string FileName,
    string FileSizeBytes,
    string FileSizeMegabytes,
    string? ContentType,
    string? S3Key,
    DateTime CreatedAt,
    DateTime? UpdatedAt)
{
    private const decimal BytesPerMegabyte = 1024m * 1024m;

    public static RecordingResponse FromRecording(Recording recording)
    {
        return new RecordingResponse(
            recording.Id,
            recording.Title,
            recording.Status.ToString().ToLowerInvariant(),
            recording.FileName,
            recording.FileSizeBytes.ToString(CultureInfo.InvariantCulture),
            FormatFileSizeMegabytes(recording.FileSizeBytes),
            recording.ContentType,
            recording.S3Key,
            recording.CreatedAt,
            recording.UpdatedAt);
    }

    private static string FormatFileSizeMegabytes(long fileSizeBytes)
    {
        var megabytes = fileSizeBytes / BytesPerMegabyte;
        return $"{megabytes.ToString("0.##", CultureInfo.InvariantCulture)} MB";
    }
}
