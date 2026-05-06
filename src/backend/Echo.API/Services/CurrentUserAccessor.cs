using Echo.Domain.Entities;

namespace Echo.API.Services;

public class CurrentUserAccessor(IHttpContextAccessor httpContextAccessor) : ICurrentUserAccessor
{
    public const string CurrentUserItemKey = "CurrentUser";

    public User? CurrentUser =>
        httpContextAccessor.HttpContext?.Items[CurrentUserItemKey] as User;
}
