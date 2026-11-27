using System.Text.Json;
using Echo.API.Database;
using Echo.API.Entities;
using Echo.API.Enums;
using Echo.API.Features.Jobs;
using Microsoft.EntityFrameworkCore;

namespace Echo.API.Tests.Jobs;

public sealed class JobDispatchTests : IAsyncLifetime
{
    private readonly string path = Path.Combine(Path.GetTempPath(), $"echo-jobs-{Guid.NewGuid()}.db");
    private EchoDbContext db = null!;
    public async Task InitializeAsync()
    {
        db = new EchoDbContext(new DbContextOptionsBuilder<EchoDbContext>().UseSqlite($"Data Source={path}").UseSnakeCaseNamingConvention().Options);
        await db.Database.MigrateAsync();
    }
    public async Task DisposeAsync() { await db.DisposeAsync(); Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); File.Delete(path); }
    private async Task<Recording> Recording()
    {
        var recording = new Recording { Id = Guid.CreateVersion7(), FileName = "test.wav", StorageKey = "recordings/audio.wav" };
        recording.TranscriptionJob.Id = Guid.CreateVersion7();
        db.Recordings.Add(recording); await db.SaveChangesAsync(); return recording;
    }
    private async Task<JobMessage> Dispatch()
    {
        await JobDispatch.Prepare(db, default);
        var row = await db.JobOutbox.OrderByDescending(m => m.CreatedAt).FirstAsync();
        return JsonSerializer.Deserialize<JobMessage>(row.Payload, RabbitOptions.Json)!;
    }
    [Fact]
    public async Task PreparesDurableMessageOnce_AndIgnoresDuplicateAndStaleResults()
    {
        var recording = await Recording(); var job = await Dispatch();
        await JobDispatch.Prepare(db, default);
        Assert.Equal(1, await db.JobOutbox.CountAsync());
        Assert.Equal(recording.StorageKey, job.FileKey);
        var result = new JobResult(job.JobId, job.ClaimToken, job.Kind, "completed", TranscriptionText: "text");
        await JobDispatch.Apply(db, result with { ClaimToken = Guid.NewGuid().ToString() }, default);
        Assert.Null(recording.TranscribedText);
        await JobDispatch.Apply(db, result, default); await JobDispatch.Apply(db, result, default);
        Assert.Equal("text", recording.TranscribedText); Assert.Equal(1, recording.TranscriptRevision);
        Assert.Equal(JobStatus.Completed, recording.TranscriptionJob.Status);
    }
    [Fact]
    public async Task OutboxAndClaimSurviveApiRestartWithoutPreparingAnotherMessage()
    {
        var recording = await Recording(); var message = await Dispatch();
        await db.DisposeAsync();
        db = new EchoDbContext(new DbContextOptionsBuilder<EchoDbContext>().UseSqlite($"Data Source={path}").UseSnakeCaseNamingConvention().Options);
        await JobDispatch.Prepare(db, default);
        Assert.Equal(1, await db.JobOutbox.CountAsync());
        var persisted = await db.TranscriptionJobs.SingleAsync(j => j.RecordingId == recording.Id);
        Assert.Equal(message.ClaimToken, persisted.ClaimToken);
        Assert.Equal(1, persisted.AttemptCount);
        Assert.Equal(JobStatus.Processing, persisted.Status);
    }

    [Fact]
    public async Task RetryableFailuresAreBounded_AndOldAttemptCannotCompleteNewAttempt()
    {
        var recording = await Recording(); JobMessage? old = null;
        for (var i = 1; i <= 3; i++)
        {
            recording.TranscriptionJob.NextAttemptAt = null; await db.SaveChangesAsync();
            var job = await Dispatch();
            if (old is not null) await JobDispatch.Apply(db, new(old.JobId, old.ClaimToken, old.Kind, "completed", TranscriptionText: "stale"), default);
            Assert.Null(recording.TranscribedText);
            await JobDispatch.Apply(db, new(job.JobId, job.ClaimToken, job.Kind, "failed", Retryable: true), default);
            Assert.Equal(i < 3 ? JobStatus.Created : JobStatus.Failed, recording.TranscriptionJob.Status);
            old = job;
        }
        Assert.Equal(3, recording.TranscriptionJob.RetryCount);
        Assert.Equal(RecordingStatus.Failed, recording.Status);
    }
    [Fact]
    public async Task RefinementCarriesSourceSnapshotAndPersistsMetadata()
    {
        var recording = await Recording(); recording.TranscriptionJob.Status = JobStatus.Completed;
        var job = new RefinementJob { Id = Guid.CreateVersion7(), RecordingId = recording.Id, SourceText = "reviewed", Format = "notes", RequestKey = "key", TranscriptRevision = 2 };
        db.RefinementJobs.Add(job); await db.SaveChangesAsync();
        var message = await Dispatch(); Assert.Equal("reviewed", message.SourceText);
        await JobDispatch.Apply(db, new(message.JobId, message.ClaimToken, message.Kind, "completed", Content: "# Notes", Model: "model", Provider: "provider", PromptVersion: "1"), default);
        Assert.Equal(JobStatus.Completed, job.Status); Assert.Equal("# Notes", job.Content); Assert.Equal("model", job.Model);
    }
    [Fact]
    public async Task DeletedJobsIgnoreLateResults_AndMalformedResultsAreRejected()
    {
        var recording = await Recording(); var message = await Dispatch();
        db.Recordings.Remove(recording); await db.SaveChangesAsync();
        await JobDispatch.Apply(db, new(message.JobId, message.ClaimToken, message.Kind, "completed", TranscriptionText: "late"), default);
        await Assert.ThrowsAsync<JsonException>(() => JobDispatch.Apply(db, new(message.JobId, message.ClaimToken, message.Kind, "completed"), default));
        Assert.Empty(await db.Recordings.ToListAsync());
    }

    [Fact]
    public async Task ReclaimStale_ReclaimsExpiredTranscriptionJob_RedispatchesWithNewClaimToken_AndIgnoresLateResult()
    {
        var recording = await Recording();
        var first = await Dispatch();

        recording.TranscriptionJob.UpdatedAt = DateTime.UtcNow.AddMinutes(-15);
        await db.SaveChangesAsync();

        var reclaimed = await JobDispatch.ReclaimStale(db, TimeSpan.FromMinutes(10), default);

        Assert.Equal(1, reclaimed);
        Assert.Equal(JobStatus.Created, recording.TranscriptionJob.Status);
        Assert.Null(recording.TranscriptionJob.ClaimToken);
        Assert.NotNull(recording.TranscriptionJob.NextAttemptAt);
        Assert.Equal(1, recording.TranscriptionJob.RetryCount);
        Assert.Equal(RecordingStatus.Pending, recording.Status);

        var second = await Dispatch();
        Assert.NotEqual(first.ClaimToken, second.ClaimToken);
        Assert.Equal(2, recording.TranscriptionJob.AttemptCount);
        Assert.Equal(JobStatus.Processing, recording.TranscriptionJob.Status);
        Assert.Equal(RecordingStatus.Transcribing, recording.Status);

        // Late zombie result carrying the old ClaimToken must be ignored.
        await JobDispatch.Apply(db, new(first.JobId, first.ClaimToken, first.Kind, "completed", TranscriptionText: "zombie"), default);
        Assert.Null(recording.TranscribedText);
        Assert.Equal(JobStatus.Processing, recording.TranscriptionJob.Status);

        // Fresh result carrying the new ClaimToken must succeed.
        await JobDispatch.Apply(db, new(second.JobId, second.ClaimToken, second.Kind, "completed", TranscriptionText: "fresh"), default);
        Assert.Equal("fresh", recording.TranscribedText);
        Assert.Equal(JobStatus.Completed, recording.TranscriptionJob.Status);
        Assert.Equal(RecordingStatus.Transcribed, recording.Status);
    }

    [Fact]
    public async Task ReclaimStale_ReclaimsExpiredRefinementJob_RedispatchesWithNewClaimToken_AndIgnoresLateResult()
    {
        var recording = await Recording();
        recording.TranscriptionJob.Status = JobStatus.Completed;
        var job = new RefinementJob
        {
            Id = Guid.CreateVersion7(),
            RecordingId = recording.Id,
            SourceText = "reviewed transcript",
            Format = "notes",
            RequestKey = "refinement-stale-key",
            TranscriptRevision = 1
        };
        db.RefinementJobs.Add(job);
        await db.SaveChangesAsync();

        var first = await Dispatch();

        // Also exercise CreatedAt fallback when UpdatedAt is null.
        job.UpdatedAt = null;
        job.CreatedAt = DateTime.UtcNow.AddMinutes(-15);
        await db.SaveChangesAsync();

        var reclaimed = await JobDispatch.ReclaimStale(db, TimeSpan.FromMinutes(10), default);

        Assert.Equal(1, reclaimed);
        Assert.Equal(JobStatus.Created, job.Status);
        Assert.Null(job.ClaimToken);
        Assert.NotNull(job.NextAttemptAt);

        var second = await Dispatch();
        Assert.NotEqual(first.ClaimToken, second.ClaimToken);
        Assert.Equal(2, job.AttemptCount);
        Assert.Equal(JobStatus.Processing, job.Status);

        await JobDispatch.Apply(db, new(first.JobId, first.ClaimToken, first.Kind, "completed",
            Content: "stale", Model: "m", Provider: "p", PromptVersion: "1"), default);
        Assert.Null(job.Content);
        Assert.Equal(JobStatus.Processing, job.Status);

        await JobDispatch.Apply(db, new(second.JobId, second.ClaimToken, second.Kind, "completed",
            Content: "# Final Notes", Model: "m", Provider: "p", PromptVersion: "1"), default);
        Assert.Equal(JobStatus.Completed, job.Status);
        Assert.Equal("# Final Notes", job.Content);
    }

    [Fact]
    public async Task ReclaimStale_MarksJobsFailed_WhenAttemptCountReachedLimit()
    {
        var recording = await Recording();
        var transcriptionMessage = await Dispatch();
        recording.TranscriptionJob.AttemptCount = 3;
        recording.TranscriptionJob.UpdatedAt = DateTime.UtcNow.AddMinutes(-15);

        var refinement = new RefinementJob
        {
            Id = Guid.CreateVersion7(),
            RecordingId = recording.Id,
            SourceText = "reviewed",
            Format = "blog",
            RequestKey = "refinement-max-attempts",
            TranscriptRevision = 1,
            Status = JobStatus.Processing,
            ClaimToken = Guid.NewGuid().ToString(),
            AttemptCount = 3,
            UpdatedAt = DateTime.UtcNow.AddMinutes(-15)
        };
        db.RefinementJobs.Add(refinement);
        await db.SaveChangesAsync();

        var outboxBefore = await db.JobOutbox.CountAsync();
        var reclaimed = await JobDispatch.ReclaimStale(db, TimeSpan.FromMinutes(10), default);

        Assert.Equal(2, reclaimed);

        Assert.Equal(JobStatus.Failed, recording.TranscriptionJob.Status);
        Assert.Null(recording.TranscriptionJob.ClaimToken);
        Assert.Null(recording.TranscriptionJob.NextAttemptAt);
        Assert.Equal(JobDispatch.ProcessingTimeoutFailureReason, recording.TranscriptionJob.FailureReason);
        Assert.Equal(1, recording.TranscriptionJob.RetryCount);
        Assert.Equal(RecordingStatus.Failed, recording.Status);

        Assert.Equal(JobStatus.Failed, refinement.Status);
        Assert.Null(refinement.ClaimToken);
        Assert.Null(refinement.NextAttemptAt);
        Assert.Equal(JobDispatch.ProcessingTimeoutFailureReason, refinement.FailureReason);

        // Late result after timeout failure must be ignored and Prepare must not re-enqueue failed jobs.
        await JobDispatch.Apply(db, new(transcriptionMessage.JobId, transcriptionMessage.ClaimToken, transcriptionMessage.Kind, "completed", TranscriptionText: "late"), default);
        Assert.Equal(JobStatus.Failed, recording.TranscriptionJob.Status);

        await JobDispatch.Prepare(db, TimeSpan.FromMinutes(10), default);
        Assert.Equal(outboxBefore, await db.JobOutbox.CountAsync());
    }

    [Fact]
    public async Task ReclaimStale_DoesNotReclaimNonExpiredProcessingJobs()
    {
        var recording = await Recording();
        var transcriptionMessage = await Dispatch();

        var refinement = new RefinementJob
        {
            Id = Guid.CreateVersion7(),
            RecordingId = recording.Id,
            SourceText = "reviewed",
            Format = "notes",
            RequestKey = "refinement-active",
            TranscriptRevision = 1
        };
        db.RefinementJobs.Add(refinement);
        await db.SaveChangesAsync();

        var refinementMessage = await Dispatch();
        var outboxCount = await db.JobOutbox.CountAsync();

        var reclaimed = await JobDispatch.ReclaimStale(db, TimeSpan.FromMinutes(10), default);

        Assert.Equal(0, reclaimed);
        Assert.Equal(JobStatus.Processing, recording.TranscriptionJob.Status);
        Assert.Equal(transcriptionMessage.ClaimToken, recording.TranscriptionJob.ClaimToken);
        Assert.Equal(1, recording.TranscriptionJob.AttemptCount);
        Assert.Equal(0, recording.TranscriptionJob.RetryCount);

        Assert.Equal(JobStatus.Processing, refinement.Status);
        Assert.Equal(refinementMessage.ClaimToken, refinement.ClaimToken);
        Assert.Equal(1, refinement.AttemptCount);

        await JobDispatch.Prepare(db, TimeSpan.FromMinutes(10), default);
        Assert.Equal(outboxCount, await db.JobOutbox.CountAsync());
    }
}
