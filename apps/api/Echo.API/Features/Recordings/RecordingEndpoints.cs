namespace Echo.API.Features.Recordings;

public static class RecordingEndpoints
{
    public static IEndpointRouteBuilder MapRecordings(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("recordings")
            .WithTags("Recordings");

        group.MapPost("/", () => { })
            .WithName("CreateRecording")
            .WithSummary("Create a recording")
            .WithDescription("Creates a new recording entry.")
            .Produces(StatusCodes.Status200OK);

        group.MapGet("/", () => { })
            .WithName("ListRecordings")
            .WithSummary("List recordings")
            .WithDescription("Returns all available recording entries.")
            .Produces(StatusCodes.Status200OK);

        group.MapGet("{id:guid}", () => { })
            .WithName("GetRecordingById")
            .WithSummary("Get a recording")
            .WithDescription("Returns the recording entry for the specified recording ID.")
            .Produces(StatusCodes.Status200OK);

        group.MapDelete("{id:guid}", () => { })
            .WithName("DeleteRecording")
            .WithSummary("Delete a recording")
            .WithDescription("Deletes the recording entry for the specified recording ID.")
            .Produces(StatusCodes.Status200OK);
        
        return endpoints;
    }
}
