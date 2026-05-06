using Echo.Domain.Enums;

namespace Echo.Domain.Common;

public static class RecordingErrors
{
    public const string EmptyUserId = "User ID cannot be empty.";
    public const string FileSizeExceeded = "File size exceeds the maximum allowed size of 25 MB.";
    public const string FileEmpty = "Uploaded file is empty.";
    public const string FileMissing = "No file was provided.";
    public const string Unauthenticated = "Request is not associated with an authenticated user.";
    public const string UnreadableStream = "Uploaded file stream could not be read.";
    public const string UploadFailed = "Upload failed.";

    public static string ContentMismatch(string claimedExtension) =>
        $"File contents do not match the claimed extension '{claimedExtension}'.";

    public static string UnsupportedFileType(string extension, IEnumerable<string> allowedTypes) =>
        $"File type '{extension}' is not supported. Allowed types: {string.Join(", ", allowedTypes)}.";

    public static string InvalidStatusTransition(Guid id, RecordingStatus from, RecordingStatus to) =>
        $"Cannot transition recording {id} from {from} to {to}.";
}
