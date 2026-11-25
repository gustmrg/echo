using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Echo.API.Database;
using Echo.API.Enums;
using Echo.API.Features.Jobs;
using Echo.API.Shared;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Echo.API.Tests.Features;

public sealed class ObservabilityTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"echo-obs-tests-{Guid.NewGuid():N}");
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;

    public ObservabilityTests()
    {
        Directory.CreateDirectory(_root);
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Testing");
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = $"Data Source={Path.Combine(_root, "echo.db")}",
                ["Storage:Provider"] = "Local",
                ["Storage:Local:RootPath"] = Path.Combine(_root, "files")
            }));
            builder.ConfigureServices(services =>
            {
                // Disable background RabbitMQ reconnect loop so health state transitions are deterministic.
                services.RemoveAll<IHostedService>();
            });
        });
        _client = _factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
    }

    [Fact]
    public async Task HealthLive_Returns200HealthyJson()
    {
        var response = await _client.GetAsync("/health/live");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("healthy", body.GetProperty("status").GetString());
    }

    [Fact]
    public async Task HealthReady_ReflectsRabbitAndSqliteState()
    {
        var rabbitHealth = _factory.Services.GetRequiredService<IRabbitHealthState>();
        rabbitHealth.MarkDisconnected("broker offline");

        var unhealthyResponse = await _client.GetAsync("/health/ready");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, unhealthyResponse.StatusCode);
        var unhealthyBody = await unhealthyResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("unhealthy", unhealthyBody.GetProperty("status").GetString());
        Assert.Equal("healthy", unhealthyBody.GetProperty("checks").GetProperty("sqlite").GetProperty("status").GetString());
        Assert.Equal("unhealthy", unhealthyBody.GetProperty("checks").GetProperty("rabbitmq").GetProperty("status").GetString());
        Assert.Contains("broker offline", unhealthyBody.GetProperty("checks").GetProperty("rabbitmq").GetProperty("description").GetString());

        rabbitHealth.MarkConnected();

        var healthyResponse = await _client.GetAsync("/health/ready");
        Assert.Equal(HttpStatusCode.OK, healthyResponse.StatusCode);
        var healthyBody = await healthyResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("healthy", healthyBody.GetProperty("status").GetString());
        Assert.Equal("healthy", healthyBody.GetProperty("checks").GetProperty("sqlite").GetProperty("status").GetString());
        Assert.Equal("healthy", healthyBody.GetProperty("checks").GetProperty("rabbitmq").GetProperty("status").GetString());
    }

    [Fact]
    public async Task CorrelationIdHeader_EchoesValidValue_AndGeneratesUuidForMissingOrInvalidValues()
    {
        const string provided = "trace_req-123:v1.0";
        using var validRequest = new HttpRequestMessage(HttpMethod.Get, "/health/live");
        validRequest.Headers.Add(CorrelationId.HeaderName, provided);
        var validResponse = await _client.SendAsync(validRequest);

        Assert.Equal(HttpStatusCode.OK, validResponse.StatusCode);
        Assert.Equal(provided, validResponse.Headers.GetValues(CorrelationId.HeaderName).Single());

        var missingResponse = await _client.GetAsync("/health/live");
        var generatedForMissing = missingResponse.Headers.GetValues(CorrelationId.HeaderName).Single();
        Assert.True(Guid.TryParse(generatedForMissing, out _));

        foreach (var invalid in new[] { "invalid id with spaces", "bad/value!", new string('a', 65) })
        {
            using var invalidRequest = new HttpRequestMessage(HttpMethod.Get, "/health/live");
            invalidRequest.Headers.TryAddWithoutValidation(CorrelationId.HeaderName, invalid);
            var invalidResponse = await _client.SendAsync(invalidRequest);
            var generated = invalidResponse.Headers.GetValues(CorrelationId.HeaderName).Single();
            Assert.NotEqual(invalid, generated);
            Assert.True(Guid.TryParse(generated, out _));
        }
    }

    [Fact]
    public async Task CorrelationId_FlowsFromHttpToJobsOutboxPublishPropertiesAndApplyLogs()
    {
        const string uploadCorrelation = "corr-upload-01";
        var uploadResponse = await Upload(Guid.NewGuid().ToString(), uploadCorrelation);
        uploadResponse.EnsureSuccessStatusCode();
        Assert.Equal(uploadCorrelation, uploadResponse.Headers.GetValues(CorrelationId.HeaderName).Single());
        var recordingId = (await uploadResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        var capturingLogger = new CapturingLogger();

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EchoDbContext>();
            var transcriptionJob = await db.TranscriptionJobs.SingleAsync(j => j.RecordingId == recordingId);
            Assert.Equal(uploadCorrelation, transcriptionJob.CorrelationId);

            await JobDispatch.Prepare(db, CancellationToken.None);
            var outboxRow = await db.JobOutbox.SingleAsync();
            var message = JsonSerializer.Deserialize<JobMessage>(outboxRow.Payload, RabbitOptions.Json)!;
            Assert.Equal(uploadCorrelation, message.CorrelationId);

            var publishProps = RabbitJobService.CreatePublishProperties(outboxRow, message);
            Assert.Equal(uploadCorrelation, publishProps.CorrelationId);

            var result = new JobResult(
                message.JobId,
                message.ClaimToken,
                message.Kind,
                "completed",
                TranscriptionText: "Captured transcript",
                CorrelationId: message.CorrelationId);

            await JobDispatch.Apply(db, result, CancellationToken.None, capturingLogger);
            Assert.Contains(capturingLogger.Entries, e =>
                e.Values.TryGetValue("CorrelationId", out var corr) && Equals(corr, uploadCorrelation) &&
                e.Values.TryGetValue("Kind", out var kind) && Equals(kind, "transcription") &&
                e.Values.TryGetValue("Status", out var status) && Equals(status, JobStatus.Completed) &&
                e.Values.ContainsKey("JobId"));

            db.JobOutbox.Remove(outboxRow);
            await db.SaveChangesAsync();
        }

        const string refinementCorrelation = "corr-refine-02";
        using var refinementRequest = new HttpRequestMessage(HttpMethod.Post, $"/api/recordings/{recordingId}/refinements")
        {
            Content = JsonContent.Create(new { format = "notes", expectedRevision = 1, requestKey = Guid.NewGuid() })
        };
        refinementRequest.Headers.Add(CorrelationId.HeaderName, refinementCorrelation);
        var refinementResponse = await _client.SendAsync(refinementRequest);
        Assert.Equal(HttpStatusCode.Accepted, refinementResponse.StatusCode);
        Assert.Equal(refinementCorrelation, refinementResponse.Headers.GetValues(CorrelationId.HeaderName).Single());

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EchoDbContext>();
            var refinementJob = await db.RefinementJobs.SingleAsync(j => j.RecordingId == recordingId);
            Assert.Equal(refinementCorrelation, refinementJob.CorrelationId);

            await JobDispatch.Prepare(db, CancellationToken.None);
            var outboxRow = await db.JobOutbox.SingleAsync();
            var message = JsonSerializer.Deserialize<JobMessage>(outboxRow.Payload, RabbitOptions.Json)!;
            Assert.Equal(refinementCorrelation, message.CorrelationId);

            var result = new JobResult(
                message.JobId,
                message.ClaimToken,
                message.Kind,
                "completed",
                Content: "# Refined",
                Model: "model-1",
                Provider: "provider-1",
                PromptVersion: "1",
                CorrelationId: message.CorrelationId);

            await JobDispatch.Apply(db, result, CancellationToken.None, capturingLogger);
            Assert.Contains(capturingLogger.Entries, e =>
                e.Values.TryGetValue("CorrelationId", out var corr) && Equals(corr, refinementCorrelation) &&
                e.Values.TryGetValue("Kind", out var kind) && Equals(kind, "refinement") &&
                e.Values.TryGetValue("Status", out var status) && Equals(status, JobStatus.Completed));
        }
    }

    [Fact]
    public async Task RetryTranscription_UpdatesCorrelationIdToRetryRequest()
    {
        var uploadResponse = await Upload(Guid.NewGuid().ToString(), "corr-initial");
        uploadResponse.EnsureSuccessStatusCode();
        var recordingId = (await uploadResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EchoDbContext>();
            var recording = await db.Recordings.Include(r => r.TranscriptionJob).SingleAsync(r => r.Id == recordingId);
            recording.Status = RecordingStatus.Failed;
            recording.TranscriptionJob.Status = JobStatus.Failed;
            recording.TranscriptionJob.RetryCount = 1;
            recording.TranscriptionJob.AttemptCount = 3;
            await db.SaveChangesAsync();
        }

        const string retryCorrelation = "corr-retry-99";
        using var retryRequest = new HttpRequestMessage(HttpMethod.Post, $"/api/recordings/{recordingId}/retry")
        {
            Content = JsonContent.Create(new { expectedRetryCount = 1 })
        };
        retryRequest.Headers.Add(CorrelationId.HeaderName, retryCorrelation);
        var retryResponse = await _client.SendAsync(retryRequest);
        Assert.Equal(HttpStatusCode.Accepted, retryResponse.StatusCode);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EchoDbContext>();
            var job = await db.TranscriptionJobs.SingleAsync(j => j.RecordingId == recordingId);
            Assert.Equal(retryCorrelation, job.CorrelationId);
        }
    }

    private async Task<HttpResponseMessage> Upload(string key, string correlationId)
    {
        using var form = new MultipartFormDataContent();
        var bytes = new ByteArrayContent([0x1A, 0x45, 0xDF, 0xA3, 0x01]);
        bytes.Headers.ContentType = new MediaTypeHeaderValue("audio/webm");
        form.Add(bytes, "file", "audio.webm");
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/recordings") { Content = form };
        request.Headers.Add("Idempotency-Key", key);
        request.Headers.Add(CorrelationId.HeaderName, correlationId);
        return await _client.SendAsync(request);
    }

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        Directory.Delete(_root, true);
    }

    private sealed class CapturingLogger : ILogger
    {
        public List<(LogLevel Level, Dictionary<string, object?> Values)> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            var values = new Dictionary<string, object?>();
            if (state is IEnumerable<KeyValuePair<string, object?>> pairs)
            {
                foreach (var pair in pairs)
                {
                    values[pair.Key] = pair.Value;
                }
            }
            Entries.Add((logLevel, values));
        }
    }
}
