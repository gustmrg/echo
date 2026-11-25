namespace Echo.API.Features.Refinements;

public static class RefinementEndpoints
{
    public static IEndpointRouteBuilder MapRefinements(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("recordings/{recordingId:guid}/refinements").WithTags("Refinements");
        group.MapPost("/", CreateRefinement.Handle).WithName("CreateRefinement")
            .WithSummary("Queue refinement of a saved transcript revision")
            .Produces<RefinementResponse>(202).Produces(400).Produces(404).Produces(409);
        group.MapGet("/", GetRefinements.Handle).WithName("ListRefinements")
            .WithSummary("List saved outputs and refinement progress for this transcript")
            .Produces<RefinementResponse[]>().Produces(404);
        endpoints.MapGet("outputs", GetOutputs.Handle)
            .WithTags("Outputs")
            .WithName("ListOutputs")
            .WithSummary("List completed outputs matching current transcript revisions")
            .Produces<OutputsPageResponse>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest);
        return endpoints;
    }
}

