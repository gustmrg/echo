namespace Echo.API.Shared;

public static class AudioFileValidator
{
    private delegate bool SignatureValidator(ReadOnlySpan<byte> buffer, int bytesRead);

    private static readonly Dictionary<string, SignatureValidator> Validators = new(StringComparer.OrdinalIgnoreCase)
    {
        ["application/ogg"] = IsOgg,
        ["audio/flac"] = IsFlac,
        ["audio/m4a"] = IsMp4Container,
        ["audio/mp3"] = IsMpegAudio,
        ["audio/mp4"] = IsMp4Container,
        ["audio/mpeg"] = IsMpegAudio,
        ["audio/mpga"] = IsMpegAudio,
        ["audio/ogg"] = IsOgg,
        ["audio/vnd.wave"] = IsWav,
        ["audio/wav"] = IsWav,
        ["audio/wave"] = IsWav,
        ["audio/webm"] = IsWebm,
        ["audio/x-flac"] = IsFlac,
        ["audio/x-m4a"] = IsMp4Container,
        ["audio/x-wav"] = IsWav,
    };

    public static bool IsSupportedContentType(string contentType) =>
        Validators.ContainsKey(NormalizeContentType(contentType));
    
    public static async Task<bool> IsValidAudioFileAsync(Stream stream, string claimedContentType)
    {
        if (!Validators.TryGetValue(NormalizeContentType(claimedContentType), out var validator))
            return false;

        var buffer = new byte[12];
        var originalPosition = stream.Position;
        var bytesRead = await stream.ReadAsync(buffer);
        stream.Position = originalPosition; // reset so upload can read from the start

        return validator(buffer, bytesRead);
    }

    private static bool IsWebm(ReadOnlySpan<byte> buffer, int bytesRead) =>
        HasPrefix(buffer, bytesRead, [0x1A, 0x45, 0xDF, 0xA3]); // EBML header

    private static bool IsMp4Container(ReadOnlySpan<byte> buffer, int bytesRead) =>
        bytesRead >= 8 && buffer[4..8].SequenceEqual("ftyp"u8);

    private static bool IsMpegAudio(ReadOnlySpan<byte> buffer, int bytesRead) =>
        HasPrefix(buffer, bytesRead, "ID3"u8) ||
        bytesRead >= 2 && buffer[0] == 0xFF && (buffer[1] & 0xE0) == 0xE0;

    private static bool IsWav(ReadOnlySpan<byte> buffer, int bytesRead) =>
        bytesRead >= 12 && buffer[..4].SequenceEqual("RIFF"u8) && buffer[8..12].SequenceEqual("WAVE"u8);

    private static bool IsFlac(ReadOnlySpan<byte> buffer, int bytesRead) =>
        HasPrefix(buffer, bytesRead, "fLaC"u8);

    private static bool IsOgg(ReadOnlySpan<byte> buffer, int bytesRead) =>
        HasPrefix(buffer, bytesRead, "OggS"u8);

    private static bool HasPrefix(ReadOnlySpan<byte> buffer, int bytesRead, ReadOnlySpan<byte> signature) =>
        bytesRead >= signature.Length && buffer[..signature.Length].SequenceEqual(signature);

    public static string NormalizeContentType(string contentType)
    {
        var separatorIndex = contentType.IndexOf(';');
        return separatorIndex >= 0 ? contentType[..separatorIndex].Trim() : contentType.Trim();
    }
}
