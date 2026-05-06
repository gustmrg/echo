using Echo.Domain.Common;
using Echo.Domain.Entities;

namespace Echo.Application.Interfaces;

public interface IRecordingService
{
    Task<Result<Recording>> UploadAsync(
        Guid userId,
        Stream fileStream,
        string fileName,
        string contentType,
        long fileSizeBytes,
        CancellationToken cancellationToken = default);
}
