using System.Text;
using System.Text.Json;
using Echo.API.Database;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;

namespace Echo.API.Features.Jobs;

public sealed class RabbitJobService(IServiceScopeFactory scopes, IOptions<RabbitOptions> options,
    IRabbitHealthState healthState, ILogger<RabbitJobService> logger) : BackgroundService
{
    internal static BasicProperties CreatePublishProperties(JobOutbox message, JobMessage? job)
    {
        var properties = new BasicProperties
        {
            Persistent = true,
            ContentType = "application/json",
            MessageId = message.Id.ToString()
        };
        if (!string.IsNullOrWhiteSpace(job?.CorrelationId))
        {
            properties.CorrelationId = job.CorrelationId;
        }
        return properties;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var config = options.Value;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var factory = new ConnectionFactory { Uri = new Uri(config.Url), AutomaticRecoveryEnabled = false };
                await using var connection = await factory.CreateConnectionAsync(stoppingToken);
                connection.ConnectionShutdownAsync += (_, args) =>
                {
                    healthState.MarkDisconnected(args.ReplyText ?? "RabbitMQ connection closed");
                    return Task.CompletedTask;
                };
                await using var channel = await connection.CreateChannelAsync(
                    new CreateChannelOptions(publisherConfirmationsEnabled: true, publisherConfirmationTrackingEnabled: true), stoppingToken);
                channel.ChannelShutdownAsync += (_, args) =>
                {
                    healthState.MarkDisconnected(args.ReplyText ?? "RabbitMQ channel closed");
                    return Task.CompletedTask;
                };
                foreach (var queue in new[] { config.JobQueue, config.ResultQueue })
                {
                    await channel.QueueDeclareAsync(queue + ".invalid", true, false, false, cancellationToken: stoppingToken);
                    await channel.QueueDeclareAsync(queue, true, false, false,
                        new Dictionary<string, object?> { ["x-dead-letter-exchange"] = "", ["x-dead-letter-routing-key"] = queue + ".invalid" },
                        cancellationToken: stoppingToken);
                }
                healthState.MarkConnected();
                try
                {
                    while (!stoppingToken.IsCancellationRequested && channel.IsOpen)
                    {
                        // Drain a bounded batch of results so neither direction starves.
                        for (var i = 0; i < 40; i++)
                        {
                            var delivery = await channel.BasicGetAsync(config.ResultQueue, false, stoppingToken);
                            if (delivery is null) break;
                            try
                            {
                                var result = JsonSerializer.Deserialize<JobResult>(delivery.Body.Span, RabbitOptions.Json)
                                    ?? throw new JsonException("Empty result");
                                var correlationId = !string.IsNullOrWhiteSpace(result.CorrelationId)
                                    ? result.CorrelationId
                                    : delivery.BasicProperties?.CorrelationId;
                                if (!string.IsNullOrWhiteSpace(correlationId) && string.IsNullOrWhiteSpace(result.CorrelationId))
                                {
                                    result = result with { CorrelationId = correlationId };
                                }
                                await using var scope = scopes.CreateAsyncScope();
                                await JobDispatch.Apply(
                                    scope.ServiceProvider.GetRequiredService<EchoDbContext>(),
                                    result,
                                    stoppingToken,
                                    logger);
                                await channel.BasicAckAsync(delivery.DeliveryTag, false, stoppingToken);
                                logger.LogInformation(
                                    "Acknowledged job result for JobId={JobId} Kind={Kind} Status={Status} CorrelationId={CorrelationId}",
                                    result.JobId, result.Kind, result.Status, result.CorrelationId);
                            }
                            catch (JsonException)
                            {
                                logger.LogWarning(
                                    "Rejecting malformed job result with CorrelationId={CorrelationId}",
                                    delivery.BasicProperties?.CorrelationId);
                                await channel.BasicRejectAsync(delivery.DeliveryTag, false, stoppingToken);
                            }
                        }
                        await using (var scope = scopes.CreateAsyncScope())
                        {
                            var db = scope.ServiceProvider.GetRequiredService<EchoDbContext>();
                            await JobDispatch.Prepare(db, stoppingToken);
                            var messages = await db.JobOutbox.OrderBy(m => m.CreatedAt).Take(40).ToListAsync(stoppingToken);
                            foreach (var message in messages)
                            {
                                var job = JsonSerializer.Deserialize<JobMessage>(message.Payload, RabbitOptions.Json);
                                using var deadline = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                                deadline.CancelAfter(TimeSpan.FromSeconds(15));
                                await channel.BasicPublishAsync("", config.JobQueue, true,
                                    CreatePublishProperties(message, job),
                                    Encoding.UTF8.GetBytes(message.Payload), deadline.Token);
                                db.JobOutbox.Remove(message);
                                await db.SaveChangesAsync(stoppingToken);
                                logger.LogInformation(
                                    "Published job JobId={JobId} Kind={Kind} Status={Status} CorrelationId={CorrelationId}",
                                    job?.JobId, job?.Kind, "published", job?.CorrelationId);
                            }
                        }
                        await Task.Delay(config.PollIntervalMs, stoppingToken);
                    }
                }
                finally
                {
                    if (healthState.IsConnected)
                    {
                        healthState.MarkDisconnected(stoppingToken.IsCancellationRequested
                            ? "Service stopping"
                            : "RabbitMQ channel closed");
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                healthState.MarkDisconnected("Service stopping");
                break;
            }
            catch (Exception error)
            {
                healthState.MarkDisconnected(error.Message);
                logger.LogWarning(error, "Job transport disconnected; durable jobs will be retried");
                try { await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken); }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            }
        }
    }
}
