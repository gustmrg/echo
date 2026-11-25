using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Echo.API.Database;
using Echo.API.Entities;
using Echo.API.Enums;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Echo.API.Tests.Features;

public sealed class ReadContractsTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), $"echo-read-tests-{Guid.NewGuid():N}");
    private readonly WebApplicationFactory<Program> factory;
    private readonly HttpClient client;

    public ReadContractsTests()
    {
        Directory.CreateDirectory(root);
        factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Testing");
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = $"Data Source={Path.Combine(root, "echo.db")}",
                ["Storage:Provider"] = "Local",
                ["Storage:Local:RootPath"] = Path.Combine(root, "files")
            }));
        });
        client = factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
    }

    [Fact]
    public async Task GetRecordings_ReturnsSlimPagedSummaries_OrderedDeterministically()
    {
        var baseTime = new DateTime(2026, 9, 1, 12, 0, 0, DateTimeKind.Utc);
        var oldestId = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var tiedLowerId = Guid.Parse("00000000-0000-0000-0000-000000000002");
        var tiedHigherId = Guid.Parse("00000000-0000-0000-0000-000000000003");
        var newestId = Guid.Parse("00000000-0000-0000-0000-000000000004");

        await SeedAsync(db =>
        {
            db.Recordings.AddRange(
                CreateRecording(oldestId, "Oldest note", "oldest.webm", RecordingStatus.Pending, baseTime, transcribedText: "Huge transcript 1", editedText: "Edited 1"),
                CreateRecording(tiedLowerId, "Tied lower", "lower.webm", RecordingStatus.Transcribed, baseTime.AddMinutes(5), transcribedText: "Huge transcript 2", editedText: "Edited 2"),
                CreateRecording(tiedHigherId, "Tied higher", "higher.webm", RecordingStatus.Failed, baseTime.AddMinutes(5), failureReason: "Timeout", attemptCount: 3, retryCount: 2),
                CreateRecording(newestId, null, "newest-recording.webm", RecordingStatus.Transcribed, baseTime.AddMinutes(10), transcribedText: "Secret body", editedText: "Reviewed body", transcriptRevision: 2));
        });

        var page1 = await GetJsonAsync("/api/recordings?page=1&pageSize=2");
        Assert.Equal(1, page1.GetProperty("page").GetInt32());
        Assert.Equal(2, page1.GetProperty("pageSize").GetInt32());
        Assert.Equal(4, page1.GetProperty("totalCount").GetInt32());
        Assert.True(page1.GetProperty("hasMore").GetBoolean());

        var page1Items = page1.GetProperty("items");
        Assert.Equal(2, page1Items.GetArrayLength());
        Assert.Equal(newestId, page1Items[0].GetProperty("id").GetGuid());
        Assert.Equal(tiedHigherId, page1Items[1].GetProperty("id").GetGuid());
        Assert.Equal("Timeout", page1Items[1].GetProperty("failureReason").GetString());
        Assert.Equal(3, page1Items[1].GetProperty("attemptCount").GetInt32());
        Assert.Equal(2, page1Items[1].GetProperty("retryCount").GetInt32());

        foreach (var item in page1Items.EnumerateArray())
        {
            Assert.False(item.TryGetProperty("transcribedText", out _));
            Assert.False(item.TryGetProperty("editedText", out _));
        }

        var page2 = await GetJsonAsync("/api/recordings?page=2&pageSize=2");
        Assert.Equal(2, page2.GetProperty("page").GetInt32());
        Assert.Equal(4, page2.GetProperty("totalCount").GetInt32());
        Assert.False(page2.GetProperty("hasMore").GetBoolean());
        var page2Items = page2.GetProperty("items");
        Assert.Equal(2, page2Items.GetArrayLength());
        Assert.Equal(tiedLowerId, page2Items[0].GetProperty("id").GetGuid());
        Assert.Equal(oldestId, page2Items[1].GetProperty("id").GetGuid());

        // Single recording detail still returns full transcript fields
        var detail = await GetJsonAsync($"/api/recordings/{newestId}");
        Assert.Equal("Secret body", detail.GetProperty("transcribedText").GetString());
        Assert.Equal("Reviewed body", detail.GetProperty("editedText").GetString());

        // Clamps out-of-range page and pageSize
        var clamped = await GetJsonAsync("/api/recordings?page=-5&pageSize=500");
        Assert.Equal(1, clamped.GetProperty("page").GetInt32());
        Assert.Equal(100, clamped.GetProperty("pageSize").GetInt32());
        Assert.Equal(4, clamped.GetProperty("items").GetArrayLength());
    }

    [Fact]
    public async Task GetRecordings_FiltersByStatusAndSearchQuery_AndValidatesStatus()
    {
        var baseTime = new DateTime(2026, 9, 2, 12, 0, 0, DateTimeKind.Utc);
        await SeedAsync(db =>
        {
            db.Recordings.AddRange(
                CreateRecording(Guid.CreateVersion7(), "Product Roadmap", "alpha.webm", RecordingStatus.Transcribed, baseTime),
                CreateRecording(Guid.CreateVersion7(), "Team Standup", "roadmap-notes.webm", RecordingStatus.Failed, baseTime.AddMinutes(1)),
                CreateRecording(Guid.CreateVersion7(), null, "quarterly-ROADMAP.mp3", RecordingStatus.Pending, baseTime.AddMinutes(2)),
                CreateRecording(Guid.CreateVersion7(), "Design Crit", "design.webm", RecordingStatus.Transcribed, baseTime.AddMinutes(3)));
        });

        // Case-insensitive search across Title and FileName (including null Title)
        var searchResult = await GetJsonAsync("/api/recordings?q=RoAdMaP");
        Assert.Equal(3, searchResult.GetProperty("totalCount").GetInt32());

        // Case-insensitive status filter
        var statusResult = await GetJsonAsync("/api/recordings?status=Transcribed");
        Assert.Equal(2, statusResult.GetProperty("totalCount").GetInt32());
        Assert.All(statusResult.GetProperty("items").EnumerateArray(),
            item => Assert.Equal("transcribed", item.GetProperty("status").GetString()));

        // Combined status + q filter
        var combined = await GetJsonAsync("/api/recordings?status=failed&q=roadmap");
        Assert.Equal(1, combined.GetProperty("totalCount").GetInt32());
        Assert.Equal("Team Standup", combined.GetProperty("items")[0].GetProperty("title").GetString());

        // Invalid status returns 400
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/recordings?status=unknown")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/recordings?status=0")).StatusCode);
    }

    [Fact]
    public async Task GetOutputs_ReturnsCurrentCompletedOutputs_Paginates_Filters_AndTracksActiveJobs()
    {
        var baseTime = new DateTime(2026, 9, 3, 12, 0, 0, DateTimeKind.Utc);
        var rec1Id = Guid.CreateVersion7();
        var rec2Id = Guid.CreateVersion7();

        var staleCompletedId = Guid.CreateVersion7();
        var activeStaleId = Guid.CreateVersion7();
        var completedNotesId = Guid.Parse("00000000-0000-0000-0000-000000000101");
        var completedBlogId = Guid.Parse("00000000-0000-0000-0000-000000000102");
        var completedNewsId = Guid.Parse("00000000-0000-0000-0000-000000000103");
        var failedCurrentId = Guid.CreateVersion7();
        var processingCurrentId = Guid.CreateVersion7();

        await SeedAsync(db =>
        {
            db.Recordings.AddRange(
                CreateRecording(rec1Id, "First Recording", "first.webm", RecordingStatus.Transcribed, baseTime, transcribedText: "Transcript one", transcriptRevision: 2),
                CreateRecording(rec2Id, null, "second.webm", RecordingStatus.Transcribed, baseTime.AddMinutes(1), transcribedText: "Transcript two", transcriptRevision: 1));

            db.RefinementJobs.AddRange(
                // Stale revision completed & active jobs should be excluded
                new RefinementJob
                {
                    Id = staleCompletedId, RecordingId = rec1Id, RequestKey = Guid.NewGuid().ToString(),
                    Format = "notes", TranscriptRevision = 1, SourceText = "Old",
                    Status = JobStatus.Completed, Content = "Stale notes", CreatedAt = baseTime.AddMinutes(2)
                },
                new RefinementJob
                {
                    Id = activeStaleId, RecordingId = rec1Id, RequestKey = Guid.NewGuid().ToString(),
                    Format = "interview", TranscriptRevision = 1, SourceText = "Old",
                    Status = JobStatus.Processing, CreatedAt = baseTime.AddMinutes(2)
                },
                // Current revision completed jobs
                new RefinementJob
                {
                    Id = completedNotesId, RecordingId = rec1Id, RequestKey = Guid.NewGuid().ToString(),
                    Format = "notes", TranscriptRevision = 2, SourceText = "Rev 2",
                    Status = JobStatus.Completed, Content = "One two   three\nfour",
                    Model = "gpt-4o", Provider = "openai", CreatedAt = baseTime.AddMinutes(3)
                },
                new RefinementJob
                {
                    Id = completedBlogId, RecordingId = rec1Id, RequestKey = Guid.NewGuid().ToString(),
                    Format = "blog", TranscriptRevision = 2, SourceText = "Rev 2",
                    Status = JobStatus.Completed, Content = "Blog post body here",
                    Model = "claude", Provider = "openrouter", CreatedAt = baseTime.AddMinutes(4)
                },
                new RefinementJob
                {
                    Id = completedNewsId, RecordingId = rec2Id, RequestKey = Guid.NewGuid().ToString(),
                    Format = "news", TranscriptRevision = 1, SourceText = "Rev 1",
                    Status = JobStatus.Completed, Content = "Breaking news",
                    CreatedAt = baseTime.AddMinutes(4) // tied timestamp with completedBlogId, higher Id
                },
                // Failed current job should not appear in items
                new RefinementJob
                {
                    Id = failedCurrentId, RecordingId = rec2Id, RequestKey = Guid.NewGuid().ToString(),
                    Format = "interview", TranscriptRevision = 1, SourceText = "Rev 1",
                    Status = JobStatus.Failed, FailureReason = "Provider error", CreatedAt = baseTime.AddMinutes(5)
                });
        });

        // Initially no current active jobs (stale processing job must not trigger hasActiveJobs)
        var page1 = await GetJsonAsync("/api/outputs?page=1&pageSize=2");
        Assert.Equal(1, page1.GetProperty("page").GetInt32());
        Assert.Equal(2, page1.GetProperty("pageSize").GetInt32());
        Assert.Equal(3, page1.GetProperty("totalCount").GetInt32());
        Assert.True(page1.GetProperty("hasMore").GetBoolean());
        Assert.False(page1.GetProperty("hasActiveJobs").GetBoolean());

        var items1 = page1.GetProperty("items");
        Assert.Equal(2, items1.GetArrayLength());
        Assert.Equal(completedNewsId, items1[0].GetProperty("id").GetGuid());
        Assert.Equal(rec2Id, items1[0].GetProperty("recordingId").GetGuid());
        Assert.Equal(JsonValueKind.Null, items1[0].GetProperty("recordingTitle").ValueKind);
        Assert.Equal("second.webm", items1[0].GetProperty("recordingFileName").GetString());
        Assert.Equal("news", items1[0].GetProperty("format").GetString());
        Assert.Equal(2, items1[0].GetProperty("wordCount").GetInt32());
        Assert.False(items1[0].TryGetProperty("content", out _));
        Assert.False(items1[0].TryGetProperty("sourceText", out _));

        Assert.Equal(completedBlogId, items1[1].GetProperty("id").GetGuid());
        Assert.Equal("First Recording", items1[1].GetProperty("recordingTitle").GetString());
        Assert.Equal("claude", items1[1].GetProperty("model").GetString());
        Assert.Equal("openrouter", items1[1].GetProperty("provider").GetString());
        Assert.Equal(4, items1[1].GetProperty("wordCount").GetInt32());

        var page2 = await GetJsonAsync("/api/outputs?page=2&pageSize=2");
        Assert.False(page2.GetProperty("hasMore").GetBoolean());
        var items2 = page2.GetProperty("items");
        Assert.Single(items2.EnumerateArray());
        Assert.Equal(completedNotesId, items2[0].GetProperty("id").GetGuid());
        Assert.Equal(4, items2[0].GetProperty("wordCount").GetInt32());

        // Format filter & validation
        var filtered = await GetJsonAsync("/api/outputs?format=NOTES");
        Assert.Equal(1, filtered.GetProperty("totalCount").GetInt32());
        Assert.Equal(completedNotesId, filtered.GetProperty("items")[0].GetProperty("id").GetGuid());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/outputs?format=podcast")).StatusCode);

        // Add an active job on current revision -> hasActiveJobs becomes true
        await SeedAsync(db =>
        {
            db.RefinementJobs.Add(new RefinementJob
            {
                Id = processingCurrentId, RecordingId = rec2Id, RequestKey = Guid.NewGuid().ToString(),
                Format = "blog", TranscriptRevision = 1, SourceText = "Rev 1",
                Status = JobStatus.Processing, CreatedAt = baseTime.AddMinutes(6)
            });
        });

        var withActive = await GetJsonAsync("/api/outputs");
        Assert.True(withActive.GetProperty("hasActiveJobs").GetBoolean());
        Assert.Equal(3, withActive.GetProperty("totalCount").GetInt32());

        // Editing rec1's transcript bumps its TranscriptRevision to 3, excluding its rev 2 outputs
        var editResp = await client.PutAsJsonAsync($"/api/recordings/{rec1Id}/transcript",
            new { text = "Updated transcript for rev 3", expectedRevision = 2 });
        Assert.Equal(HttpStatusCode.OK, editResp.StatusCode);

        var afterEdit = await GetJsonAsync("/api/outputs");
        Assert.Equal(1, afterEdit.GetProperty("totalCount").GetInt32());
        Assert.Equal(completedNewsId, afterEdit.GetProperty("items")[0].GetProperty("id").GetGuid());
        Assert.True(afterEdit.GetProperty("hasActiveJobs").GetBoolean());

        // Completing the active job turns hasActiveJobs back to false
        await SeedAsync(db =>
        {
            var job = db.RefinementJobs.Single(j => j.Id == processingCurrentId);
            job.Status = JobStatus.Completed;
            job.Content = "Finished blog output";
        });

        var afterComplete = await GetJsonAsync("/api/outputs");
        Assert.False(afterComplete.GetProperty("hasActiveJobs").GetBoolean());
        Assert.Equal(2, afterComplete.GetProperty("totalCount").GetInt32());
    }

    private static Recording CreateRecording(
        Guid id,
        string? title,
        string fileName,
        RecordingStatus status,
        DateTime createdAt,
        string? transcribedText = null,
        string? editedText = null,
        int transcriptRevision = 0,
        string? failureReason = null,
        int attemptCount = 0,
        int retryCount = 0)
    {
        return new Recording
        {
            Id = id,
            Title = title,
            FileName = fileName,
            FileSizeBytes = 1024,
            ContentType = "audio/webm",
            Status = status,
            TranscribedText = transcribedText,
            EditedText = editedText,
            TranscriptRevision = transcriptRevision,
            CreatedAt = createdAt,
            TranscriptionJob = new TranscriptionJob
            {
                Id = Guid.CreateVersion7(),
                RecordingId = id,
                Status = status switch
                {
                    RecordingStatus.Transcribed => JobStatus.Completed,
                    RecordingStatus.Failed => JobStatus.Failed,
                    RecordingStatus.Transcribing => JobStatus.Processing,
                    _ => JobStatus.Created
                },
                FailureReason = failureReason,
                AttemptCount = attemptCount,
                RetryCount = retryCount,
                CreatedAt = createdAt
            }
        };
    }

    private async Task SeedAsync(Action<EchoDbContext> seed)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EchoDbContext>();
        seed(db);
        await db.SaveChangesAsync();
    }

    private async Task<JsonElement> GetJsonAsync(string path)
    {
        var response = await client.GetAsync(path);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    public void Dispose()
    {
        client.Dispose();
        factory.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        Directory.Delete(root, true);
    }
}
