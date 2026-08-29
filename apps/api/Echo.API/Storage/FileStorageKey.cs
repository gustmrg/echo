namespace Echo.API.Storage;

internal static class FileStorageKey
{
    public static string Create(string fileName, FileStorageContext context, string identifier)
    {
        var folder = context switch
        {
            FileStorageContext.UserAvatar => "users/avatars",
            FileStorageContext.AudioRecording => "recordings",
            _ => throw new ArgumentOutOfRangeException(nameof(context), context,
                $"Unhandled {nameof(FileStorageContext)} value: {context}"),
        };

        var idSegment = !string.IsNullOrWhiteSpace(identifier) ? identifier : "global";
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        var uniqueName = Guid.NewGuid().ToString("N");

        return $"{folder}/{idSegment}/{uniqueName}{extension}";
    }
}
