using Echo.Domain.Entities;

namespace Echo.Application.Interfaces;

/// <summary>
/// Provides user identity operations such as registration and authentication.
/// </summary>
public interface IIdentityService
{
    /// <summary>
    /// Retrieves a user by their unique identifier.
    /// </summary>
    /// <param name="userId">The user's unique identifier.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The <see cref="User"/> if found; otherwise <c>null</c>.</returns>
    Task<User?> GetUserByIdAsync(Guid userId, CancellationToken cancellationToken = default);
}