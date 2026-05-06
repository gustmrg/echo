using Echo.Domain.Common;

namespace Echo.Application.Interfaces;

public interface IAudioContentValidator
{
    Task<Result> ValidateAsync(Stream stream, string fileExtension, CancellationToken cancellationToken = default);
}
