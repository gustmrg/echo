using Echo.API.Features.Auth;

namespace Echo.API.Features.Refinements;

public static class RefinementEndpoints
{
    public static IEndpointRouteBuilder MapRefinements(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("recordings/{recordingId:guid}/refinements")
            .WithTags("Refinements")
            .RequireAuthorization(AuthOptions.PolicyName);
        group.MapPost("/", CreateRefinement.Handle).WithName("CreateRefinement")
            .WithSummary("Queue refinement of a saved transcript revision")
            .Produces<RefinementResponse>(202).Produces(400).Produces(404).Produces(409);
        group.MapGet("/", GetRefinements.Handle).WithName("ListRefinements")
            .WithSummary("List saved outputs and refinement progress for this transcript")
            .Produces<RefinementResponse[]>().Produces(404);
        return endpoints;
    }
}

