using Echo.Domain.Entities;

namespace Echo.Domain.Interfaces;

public interface IRecordingRepository
{
    Task<Recording?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task AddAsync(Recording recording, CancellationToken cancellationToken = default);
}
