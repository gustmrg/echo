using Echo.Domain.Entities;

namespace Echo.API.Services;

public interface ICurrentUserAccessor
{
    User? CurrentUser { get; }
}
