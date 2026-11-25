using Echo.API.Features.Auth;

namespace Echo.API.Features.Recordings;

public static class RecordingEndpoints
{
    public static IEndpointRouteBuilder MapRecordings(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("recordings")
            .WithTags("Recordings")
            .RequireAuthorization(AuthOptions.PolicyName);

        group.MapPost("/", CreateRecording.Handle)
            .WithName("CreateRecording")
            .WithSummary("Create a recording")
            .WithDescription("Uploads audio and queues transcription. Requires a UUID Idempotency-Key header; reuse it for retries of the same file.")
            .Produces<RecordingResponse>(StatusCodes.Status201Created)
            .Produces<RecordingResponse>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status409Conflict)
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
        
        group.MapPut("{id:guid}/transcript", SaveTranscript.Handle)
            .WithName("SaveTranscript").WithSummary("Save an edited transcript with revision checking")
            .Produces<RecordingResponse>().Produces(400).Produces(404).Produces(409);
        group.MapPost("{id:guid}/retry", RetryTranscription.Handle)
            .WithName("RetryTranscription").WithSummary("Retry a failed transcription")
            .Produces<RecordingResponse>(202).Produces(404).Produces(409);
        return endpoints;
    }
}
