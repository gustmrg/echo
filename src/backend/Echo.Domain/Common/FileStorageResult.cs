namespace Echo.Domain.Common;

/// <summary>
/// Contains the result of a file storage operation.
/// </summary>
public class FileStorageResult
{
    /// <summary>
    /// Indicates whether the file was saved successfully.
    /// </summary>
    public bool Success { get; set; }

    /// <summary>
    /// The storage path where the file was saved, if successful.
    /// </summary>
    public string? StoragePath { get; set; }

    /// <summary>
    /// The file name used for storage.
    /// </summary>
    public string? FileName { get; set; }

    /// <summary>
    /// An error message describing what went wrong, if the operation failed.
    /// </summary>
    public string? ErrorMessage { get; set; }

    /// <summary>
    /// The size of the stored file in bytes.
    /// </summary>
    public long? FileSizeInBytes { get; set; }

    /// <summary>
    /// The SHA-256 hash of the stored file for integrity verification.
    /// </summary>
    public string? FileHash { get; set; }
}