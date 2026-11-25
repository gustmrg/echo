using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;

namespace Echo.API.Features.Auth;

public sealed class EchoAccessRequirement : IAuthorizationRequirement;

public sealed class EchoAccessAuthorizationHandler(IOptions<AuthOptions> options)
    : AuthorizationHandler<EchoAccessRequirement>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        EchoAccessRequirement requirement)
    {
        if (!options.Value.Enabled || context.User.Identity?.IsAuthenticated == true)
        {
            context.Succeed(requirement);
        }

        return Task.CompletedTask;
    }
}
