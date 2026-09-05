using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Echo.API.Database;
using Echo.API.Enums;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Echo.API.Tests.Features;

public sealed class WorkflowTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), $"echo-api-tests-{Guid.NewGuid():N}");
    private readonly WebApplicationFactory<Program> factory;
    private readonly HttpClient client;

    public WorkflowTests()
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
    public async Task Upload_IsDurable_AndConcurrentReplayCreatesOnlyOneJob()
    {
        var key = Guid.NewGuid().ToString();
        var responses = await Task.WhenAll(Upload(key), Upload(key));
        Assert.All(responses, r => Assert.True(r.IsSuccessStatusCode));
        var first = await Body(responses[0]);
        var second = await Body(responses[1]);
        Assert.Equal(first.GetProperty("id").GetString(), second.GetProperty("id").GetString());
        var id = first.GetProperty("id").GetGuid();
        var detail = await client.GetAsync($"/api/recordings/{id}");
        Assert.Equal(HttpStatusCode.OK, detail.StatusCode);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EchoDbContext>();
        Assert.Equal(1, await db.Recordings.CountAsync());
        Assert.Equal(1, await db.TranscriptionJobs.CountAsync());
        Assert.Single(Directory.GetFiles(Path.Combine(root, "files"), "*", SearchOption.AllDirectories));
        Assert.Equal(HttpStatusCode.Conflict, (await Upload(key, 9)).StatusCode);
    }

    [Fact]
    public async Task Upload_ValidatesContentAndRequiresIdempotencyKey()
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await Upload("not-a-uuid")).StatusCode);
        using var form = new MultipartFormDataContent();
        var bytes = new ByteArrayContent([1, 2, 3, 4]);
        bytes.Headers.ContentType = new MediaTypeHeaderValue("audio/webm");
        form.Add(bytes, "file", "audio.webm");
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/recordings") { Content = form };
        request.Headers.Add("Idempotency-Key", Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.SendAsync(request)).StatusCode);
    }

    [Fact]
    public async Task EditsAndRefinements_AreRevisionChecked_Durable_AndDeletedTogether()
    {
        var id = (await Body(await Upload(Guid.NewGuid().ToString()))).GetProperty("id").GetGuid();
        await Complete(id);
        var saved = await client.PutAsJsonAsync($"/api/recordings/{id}/transcript", new { text = "Reviewed notes", expectedRevision = 1 });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        Assert.Equal(2, (await Body(saved)).GetProperty("transcriptRevision").GetInt32());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync($"/api/recordings/{id}/transcript",
            new { text = "Stale text", expectedRevision = 1 })).StatusCode);
        var detail = await Body(await client.GetAsync($"/api/recordings/{id}"));
        Assert.Equal("Original transcript", detail.GetProperty("transcribedText").GetString());
        Assert.Equal("Reviewed notes", detail.GetProperty("editedText").GetString());
        var requestKey = Guid.NewGuid();
        var request = new { format = "notes", expectedRevision = 2, requestKey };
        var output = await Body(await client.PostAsJsonAsync($"/api/recordings/{id}/refinements", request));
        var replay = await Body(await client.PostAsJsonAsync($"/api/recordings/{id}/refinements", request));
        Assert.Equal(output.GetProperty("id").GetGuid(), replay.GetProperty("id").GetGuid());
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EchoDbContext>();
            Assert.Equal("Reviewed notes", (await db.RefinementJobs.SingleAsync()).SourceText);
        }
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/recordings/{id}/refinements",
            new { format = "notes", expectedRevision = 1, requestKey = Guid.NewGuid() })).StatusCode);
        await client.PutAsJsonAsync($"/api/recordings/{id}/transcript", new { text = "New revision", expectedRevision = 2 });
        Assert.Equal(0, (await Body(await client.GetAsync($"/api/recordings/{id}/refinements"))).GetArrayLength());
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/recordings/{id}")).StatusCode);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EchoDbContext>();
            Assert.Empty(await db.RefinementJobs.ToListAsync());
            Assert.Empty(await db.TranscriptionJobs.ToListAsync());
        }
    }

    [Fact]
    public async Task Retry_ReusesSavedAudioAndDoesNotCreateAnotherJob()
    {
        var id = (await Body(await Upload(Guid.NewGuid().ToString()))).GetProperty("id").GetGuid();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EchoDbContext>();
            var r = await db.Recordings.Include(r => r.TranscriptionJob).SingleAsync();
            r.Status = RecordingStatus.Failed;
            r.TranscriptionJob.Status = JobStatus.Failed;
            r.TranscriptionJob.AttemptCount = 3;
            r.TranscriptionJob.RetryCount = 3;
            await db.SaveChangesAsync();
        }
        var request = new { expectedRetryCount = 3 };
        Assert.Equal(HttpStatusCode.Accepted, (await client.PostAsJsonAsync($"/api/recordings/{id}/retry", request)).StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, (await client.PostAsJsonAsync($"/api/recordings/{id}/retry", request)).StatusCode);
        using var finalScope = factory.Services.CreateScope();
        Assert.Equal(1, await finalScope.ServiceProvider.GetRequiredService<EchoDbContext>().TranscriptionJobs.CountAsync());
    }

    [Fact]
    public async Task RefinementReplay_AfterReusingAnActiveJob_DoesNotRegenerateIt()
    {
        var id = (await Body(await Upload(Guid.NewGuid().ToString()))).GetProperty("id").GetGuid();
        await Complete(id);
        var first = await Body(await client.PostAsJsonAsync($"/api/recordings/{id}/refinements",
            new { format = "notes", expectedRevision = 1, requestKey = Guid.NewGuid(), regenerate = true }));
        var reusedRequest = new { format = "notes", expectedRevision = 1, requestKey = Guid.NewGuid(), regenerate = true };
        var reused = await Body(await client.PostAsJsonAsync($"/api/recordings/{id}/refinements", reusedRequest));
        Assert.Equal(first.GetProperty("id").GetGuid(), reused.GetProperty("id").GetGuid());
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EchoDbContext>();
            var job = await db.RefinementJobs.SingleAsync();
            job.Status = JobStatus.Completed;
            job.Content = "Saved output";
            await db.SaveChangesAsync();
        }
        var replay = await Body(await client.PostAsJsonAsync($"/api/recordings/{id}/refinements", reusedRequest));
        Assert.Equal(first.GetProperty("id").GetGuid(), replay.GetProperty("id").GetGuid());
        Assert.Equal("Saved output", replay.GetProperty("content").GetString());
        using var finalScope = factory.Services.CreateScope();
        Assert.Equal(1, await finalScope.ServiceProvider.GetRequiredService<EchoDbContext>().RefinementJobs.CountAsync());
    }

    private async Task Complete(Guid id)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<EchoDbContext>();
        var r = await db.Recordings.Include(r => r.TranscriptionJob).SingleAsync(r => r.Id == id);
        r.Status = RecordingStatus.Transcribed;
        r.TranscribedText = "Original transcript";
        r.TranscriptRevision = 1;
        r.TranscriptionJob.Status = JobStatus.Completed;
        await db.SaveChangesAsync();
    }
    private async Task<HttpResponseMessage> Upload(string key, byte extra = 0)
    {
        using var form = new MultipartFormDataContent();
        var bytes = new ByteArrayContent([0x1A, 0x45, 0xDF, 0xA3, extra]);
        bytes.Headers.ContentType = new MediaTypeHeaderValue("audio/webm");
        form.Add(bytes, "file", "audio.webm");
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/recordings") { Content = form };
        request.Headers.Add("Idempotency-Key", key);
        return await client.SendAsync(request);
    }
    private static async Task<JsonElement> Body(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }
    public void Dispose()
    {
        client.Dispose(); factory.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        Directory.Delete(root, true);
    }
}
