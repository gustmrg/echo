namespace Echo.API.Features.Recordings;

public static class RecordingEndpoints
{
    public static IEndpointRouteBuilder MapRecordings(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("recordings")
            .WithTags("Recordings");

        group.MapPost("/", CreateRecording.Handle)
            .WithName("CreateRecording")
            .WithSummary("Create a recording")
            .WithDescription("Creates a new recording entry.")
            .Produces(StatusCodes.Status201Created)
            .DisableAntiforgery();

        group.MapGet("/", GetRecordings.Handle)
            .WithName("ListRecordings")
            .WithSummary("List recordings")
            .WithDescription("Returns all available recording entries.")
            .Produces(StatusCodes.Status200OK);

        group.MapGet("{id:guid}", GetRecordingById.Handle)
            .WithName("GetRecordingById")
            .WithSummary("Get a recording")
            .WithDescription("Returns the recording entry for the specified recording ID.")
            .Produces(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status404NotFound);

        group.MapDelete("{id:guid}", DeleteRecording.Handle)
            .WithName("DeleteRecording")
            .WithSummary("Delete a recording")
            .WithDescription("Deletes the recording entry for the specified recording ID.")
            .Produces(StatusCodes.Status204NoContent)
            .Produces(StatusCodes.Status404NotFound);
        
        return endpoints;
    }
}
