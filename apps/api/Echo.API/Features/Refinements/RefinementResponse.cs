using Echo.API.Entities;

namespace Echo.API.Features.Refinements;

/// <summary>A saved output or the progress of a queued generation.</summary>
public sealed record RefinementResponse(Guid Id, string Format, int TranscriptRevision,
    string Status, string? Content, string? FailureReason, string? Model, string? Provider,
    string? PromptVersion, DateTime CreatedAt)
{
    public static RefinementResponse FromJob(RefinementJob job) => new(job.Id, job.Format,
        job.TranscriptRevision, job.Status.ToString().ToLowerInvariant(), job.Content,
        job.FailureReason, job.Model, job.Provider, job.PromptVersion, job.CreatedAt);
}

