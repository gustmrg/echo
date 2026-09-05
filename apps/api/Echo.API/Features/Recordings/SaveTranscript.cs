using Echo.API.Database;
using Echo.API.Enums;
using Microsoft.EntityFrameworkCore;

namespace Echo.API.Features.Recordings;

/// <summary>Edits a transcript only if its saved revision still matches.</summary>
public sealed record SaveTranscriptRequest(string Text, int ExpectedRevision);

public static class SaveTranscript
{
    public static async Task<IResult> Handle(Guid id, SaveTranscriptRequest request,
        EchoDbContext db, CancellationToken ct)
    {
        if (request.Text is null || request.Text.Length > 200_000 || request.ExpectedRevision < 0)
            return Results.BadRequest("Transcript must be at most 200,000 characters and include a valid revision.");
        var recording = await db.Recordings.SingleOrDefaultAsync(r => r.Id == id, ct);
        if (recording is null) return Results.NotFound();
        if (recording.Status != RecordingStatus.Transcribed)
            return Results.Conflict("The recording has not finished transcribing.");
        if (recording.TranscriptRevision != request.ExpectedRevision)
        {
            // Safe replay after a successful save whose response was lost.
            if (recording.EditedText == request.Text && recording.TranscriptRevision == request.ExpectedRevision + 1)
                return Results.Ok(RecordingResponse.FromRecording(recording));
            return Results.Conflict("The transcript changed in another session. Reload before saving.");
        }
        if ((recording.EditedText ?? recording.TranscribedText) != request.Text)
        {
            recording.EditedText = request.Text;
            recording.TranscriptRevision++;
            recording.UpdatedAt = DateTime.UtcNow;
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException)
            { return Results.Conflict("The transcript changed in another session. Reload before saving."); }
        }
        return Results.Ok(RecordingResponse.FromRecording(recording));
    }
}
