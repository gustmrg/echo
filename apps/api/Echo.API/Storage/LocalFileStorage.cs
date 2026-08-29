using Microsoft.Extensions.Options;

namespace Echo.API.Storage;

public sealed class LocalFileStorage : IFileStorage
{
    private readonly string _rootPath;

    public LocalFileStorage(IOptions<StorageOptions> options)
    {
        _rootPath = Path.GetFullPath(options.Value.Local.RootPath);
    }

    public string CreateFileKey(string fileName, FileStorageContext context, string identifier) =>
        FileStorageKey.Create(fileName, context, identifier);

    public async Task UploadAsync(
        string fileKey,
        Stream fileStream,
        string contentType,
        CancellationToken cancellationToken)
    {
        var destinationPath = ResolvePath(fileKey);
        var destinationDirectory = Path.GetDirectoryName(destinationPath)
            ?? throw new InvalidOperationException("The storage destination does not have a parent directory.");

        Directory.CreateDirectory(destinationDirectory);

        var temporaryPath = $"{destinationPath}.{Guid.NewGuid():N}.tmp";

        try
        {
            await using (var destination = new FileStream(
                temporaryPath,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                bufferSize: 81920,
                FileOptions.Asynchronous))
            {
                await fileStream.CopyToAsync(destination, cancellationToken);
            }

            File.Move(temporaryPath, destinationPath, overwrite: true);
        }
        catch
        {
            File.Delete(temporaryPath);
            throw;
        }
    }

    public Task DeleteAsync(string fileKey, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        File.Delete(ResolvePath(fileKey));
        return Task.CompletedTask;
    }

    private string ResolvePath(string fileKey)
    {
        if (string.IsNullOrWhiteSpace(fileKey) || Path.IsPathRooted(fileKey))
            throw new ArgumentException("A non-empty relative storage key is required.", nameof(fileKey));

        var normalizedKey = fileKey.Replace('/', Path.DirectorySeparatorChar);
        var resolvedPath = Path.GetFullPath(Path.Combine(_rootPath, normalizedKey));
        var rootPrefix = _rootPath.EndsWith(Path.DirectorySeparatorChar)
            ? _rootPath
            : _rootPath + Path.DirectorySeparatorChar;

        var pathComparison = OperatingSystem.IsWindows()
            ? StringComparison.OrdinalIgnoreCase
            : StringComparison.Ordinal;

        if (!resolvedPath.StartsWith(rootPrefix, pathComparison))
            throw new ArgumentException("The storage key resolves outside the configured root path.", nameof(fileKey));

        return resolvedPath;
    }
}
