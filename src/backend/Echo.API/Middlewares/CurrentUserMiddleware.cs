using System.Security.Claims;
using Echo.API.Services;
using Echo.Domain.Entities;
using Echo.Domain.Interfaces;

namespace Echo.API.Middlewares;

public class CurrentUserMiddleware(RequestDelegate next)
{
    public const string Auth0Namespace = "https://gustavomiranda.dev";
    
    public async Task InvokeAsync(HttpContext context, IUserRepository userRepository, IUnitOfWork unitOfWork)
    {
        if (context.User.Identity?.IsAuthenticated is true)
        {
            var auth0Id = context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

            if (!string.IsNullOrWhiteSpace(auth0Id))
            {
                var user = await userRepository.GetByAuth0IdAsync(auth0Id);

                if (user is null)
                {
                    var email = context.User.FindFirst($"{Auth0Namespace}/email")?.Value ?? string.Empty;
                    user = User.Create(email, auth0Id);
                    await userRepository.AddAsync(user);
                    await unitOfWork.SaveChangesAsync();
                }

                context.Items[CurrentUserAccessor.CurrentUserItemKey] = user;
            }
        }

        await next(context);
    }
}
