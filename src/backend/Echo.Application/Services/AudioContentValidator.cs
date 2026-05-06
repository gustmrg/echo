using Echo.Application.Interfaces;
using Echo.Domain.Common;

namespace Echo.Application.Services;

public class AudioContentValidator : IAudioContentValidator
{
    private const int HeaderBytes = 16;

    public async Task<Result> ValidateAsync(Stream stream, string fileExtension, CancellationToken cancellationToken = default)
    {
        if (!stream.CanSeek)
            return Result.Failure(RecordingErrors.UnreadableStream);

        var header = new byte[HeaderBytes];
        stream.Position = 0;
        var read = await stream.ReadAsync(header.AsMemory(0, HeaderBytes), cancellationToken);
        stream.Position = 0;

        if (read < 4)
            return Result.Failure(RecordingErrors.ContentMismatch(fileExtension));

        var ext = fileExtension.TrimStart('.').ToLowerInvariant();
        var matched = ext switch
        {
            "mp3" or "mpga" or "mpeg" => IsMp3(header),
            "wav" => IsWav(header, read),
            "mp4" or "m4a" => IsMp4(header, read),
            "webm" => IsWebm(header),
            _ => false,
        };

        return matched
            ? Result.Success()
            : Result.Failure(RecordingErrors.ContentMismatch(ext));
    }

    private static bool IsMp3(byte[] h) =>
        (h[0] == 'I' && h[1] == 'D' && h[2] == '3') ||
        (h[0] == 0xFF && (h[1] & 0xE0) == 0xE0);

    private static bool IsWav(byte[] h, int read) =>
        read >= 12 &&
        h[0] == 'R' && h[1] == 'I' && h[2] == 'F' && h[3] == 'F' &&
        h[8] == 'W' && h[9] == 'A' && h[10] == 'V' && h[11] == 'E';

    private static bool IsMp4(byte[] h, int read) =>
        read >= 8 && h[4] == 'f' && h[5] == 't' && h[6] == 'y' && h[7] == 'p';

    private static bool IsWebm(byte[] h) =>
        h[0] == 0x1A && h[1] == 0x45 && h[2] == 0xDF && h[3] == 0xA3;
}
