using System.Text;
using System.Text.Json;
using Echo.API.Database;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;

namespace Echo.API.Features.Jobs;

public sealed class RabbitJobService(IServiceScopeFactory scopes, IOptions<RabbitOptions> options,
    ILogger<RabbitJobService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var config = options.Value;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var factory = new ConnectionFactory { Uri = new Uri(config.Url), AutomaticRecoveryEnabled = false };
                await using var connection = await factory.CreateConnectionAsync(stoppingToken);
                await using var channel = await connection.CreateChannelAsync(
                    new CreateChannelOptions(publisherConfirmationsEnabled: true, publisherConfirmationTrackingEnabled: true), stoppingToken);
                foreach (var queue in new[] { config.JobQueue, config.ResultQueue })
                {
                    await channel.QueueDeclareAsync(queue + ".invalid", true, false, false, cancellationToken: stoppingToken);
                    await channel.QueueDeclareAsync(queue, true, false, false,
                        new Dictionary<string, object?> { ["x-dead-letter-exchange"] = "", ["x-dead-letter-routing-key"] = queue + ".invalid" },
                        cancellationToken: stoppingToken);
                }
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
                            await using var scope = scopes.CreateAsyncScope();
                            await JobDispatch.Apply(scope.ServiceProvider.GetRequiredService<EchoDbContext>(), result, stoppingToken);
                            await channel.BasicAckAsync(delivery.DeliveryTag, false, stoppingToken);
                        }
                        catch (JsonException)
                        {
                            logger.LogWarning("Rejecting malformed job result");
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
                            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                            deadline.CancelAfter(TimeSpan.FromSeconds(15));
                            await channel.BasicPublishAsync("", config.JobQueue, true,
                                new BasicProperties { Persistent = true, ContentType = "application/json", MessageId = message.Id.ToString() },
                                Encoding.UTF8.GetBytes(message.Payload), deadline.Token);
                            db.JobOutbox.Remove(message);
                            await db.SaveChangesAsync(stoppingToken);
                        }
                    }
                    await Task.Delay(config.PollIntervalMs, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception error)
            {
                logger.LogWarning(error, "Job transport disconnected; durable jobs will be retried");
                try { await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken); }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            }
        }
    }
}
