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
}
