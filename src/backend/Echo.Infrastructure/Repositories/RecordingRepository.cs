using Echo.Domain.Entities;
using Echo.Domain.Interfaces;

namespace Echo.Infrastructure.Repositories;

public class RecordingRepository(AppDbContext dbContext) : IRecordingRepository
{
    public async Task<Recording?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await dbContext.Recordings.FindAsync([id], cancellationToken: cancellationToken);
    }

    public async Task AddAsync(Recording recording, CancellationToken cancellationToken = default)
    {
        await dbContext.Recordings.AddAsync(recording, cancellationToken);
    }
}
