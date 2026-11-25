using System.Text;
using System.Text.Json;
using Echo.API.Database;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace Echo.API.Features.Jobs;

public sealed class RabbitJobService(
    IServiceScopeFactory scopes,
    IOptions<RabbitOptions> options,
    IJobDispatcherSignal dispatcherSignal,
    ILogger<RabbitJobService> logger) : BackgroundService
{
    private const ushort ResultConsumerPrefetch = 10;
    private const int OutboxBatchSize = 40;
    private static readonly TimeSpan ReconnectBackoff = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan PublishTimeout = TimeSpan.FromSeconds(15);
    private static readonly TimeSpan TransientNackDelay = TimeSpan.FromMilliseconds(250);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var config = options.Value;
        var pollInterval = TimeSpan.FromMilliseconds(config.PollIntervalMs);
        var processingTimeout = TimeSpan.FromSeconds(config.ProcessingTimeoutSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            var shouldBackoff = false;
            try
            {
                var factory = new ConnectionFactory
                {
                    Uri = new Uri(config.Url),
                    AutomaticRecoveryEnabled = false
                };

                using var sessionCts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                await using var connection = await factory.CreateConnectionAsync(stoppingToken);
                await using var publishChannel = await connection.CreateChannelAsync(
                    new CreateChannelOptions(publisherConfirmationsEnabled: true, publisherConfirmationTrackingEnabled: true),
                    stoppingToken);
                await using var consumerChannel = await connection.CreateChannelAsync(cancellationToken: stoppingToken);

                Task OnShutdown(object _, ShutdownEventArgs args)
                {
                    if (!stoppingToken.IsCancellationRequested)
                    {
                        logger.LogWarning(
                            "Job transport closed ({ReplyCode} {ReplyText}); reconnecting",
                            args.ReplyCode,
                            args.ReplyText);
                        CancelQuietly(sessionCts);
                    }
                    return Task.CompletedTask;
                }

                connection.ConnectionShutdownAsync += OnShutdown;
                publishChannel.ChannelShutdownAsync += OnShutdown;
                consumerChannel.ChannelShutdownAsync += OnShutdown;

                try
                {
                    foreach (var queue in new[] { config.JobQueue, config.ResultQueue })
                    {
                        await publishChannel.QueueDeclareAsync(
                            queue + ".invalid",
                            durable: true,
                            exclusive: false,
                            autoDelete: false,
                            cancellationToken: sessionCts.Token);
                        await publishChannel.QueueDeclareAsync(
                            queue,
                            durable: true,
                            exclusive: false,
                            autoDelete: false,
                            arguments: new Dictionary<string, object?>
                            {
                                ["x-dead-letter-exchange"] = "",
                                ["x-dead-letter-routing-key"] = queue + ".invalid"
                            },
                            cancellationToken: sessionCts.Token);
                    }

                    await consumerChannel.BasicQosAsync(0, ResultConsumerPrefetch, global: false, sessionCts.Token);

                    var consumer = new AsyncEventingBasicConsumer(consumerChannel);
                    consumer.ReceivedAsync += async (_, delivery) =>
                    {
                        var deliveryTag = delivery.DeliveryTag;
                        try
                        {
                            var result = JsonSerializer.Deserialize<JobResult>(delivery.Body.Span, RabbitOptions.Json)
                                ?? throw new JsonException("Empty result");

                            await using var scope = scopes.CreateAsyncScope();
                            var db = scope.ServiceProvider.GetRequiredService<EchoDbContext>();
                            await JobDispatch.Apply(db, result, sessionCts.Token);

                            await consumerChannel.BasicAckAsync(deliveryTag, multiple: false, sessionCts.Token);
                        }
                        catch (JsonException)
                        {
                            logger.LogWarning("Rejecting malformed job result");
                            try
                            {
                                if (consumerChannel.IsOpen)
                                {
                                    await consumerChannel.BasicRejectAsync(deliveryTag, requeue: false, sessionCts.Token);
                                }
                            }
                            catch (Exception rejectError)
                            {
                                logger.LogWarning(rejectError, "Failed to reject malformed job result; reconnecting");
                                CancelQuietly(sessionCts);
                            }
                        }
                        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                        {
                            // Shutting down; unacknowledged message will be redelivered by RabbitMQ.
                        }
                        catch (Exception error)
                        {
                            logger.LogWarning(error, "Failed to apply job result; requeuing for redelivery");
                            try
                            {
                                await Task.Delay(TransientNackDelay, sessionCts.Token);
                                if (consumerChannel.IsOpen)
                                {
                                    await consumerChannel.BasicNackAsync(deliveryTag, multiple: false, requeue: true, sessionCts.Token);
                                }
                                else
                                {
                                    CancelQuietly(sessionCts);
                                }
                            }
                            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                            {
                                // Shutting down cleanly.
                            }
                            catch (Exception nackError)
                            {
                                logger.LogWarning(nackError, "Failed to nack job result; reconnecting");
                                CancelQuietly(sessionCts);
                            }
                        }
                    };

                    await consumerChannel.BasicConsumeAsync(
                        queue: config.ResultQueue,
                        autoAck: false,
                        consumer: consumer,
                        cancellationToken: sessionCts.Token);

                    while (!sessionCts.IsCancellationRequested &&
                           connection.IsOpen &&
                           publishChannel.IsOpen &&
                           consumerChannel.IsOpen)
                    {
                        var hasMoreOutbox = false;
                        await using (var scope = scopes.CreateAsyncScope())
                        {
                            var db = scope.ServiceProvider.GetRequiredService<EchoDbContext>();
                            await JobDispatch.Prepare(db, processingTimeout, sessionCts.Token);

                            var messages = await db.JobOutbox
                                .OrderBy(m => m.CreatedAt)
                                .Take(OutboxBatchSize)
                                .ToListAsync(sessionCts.Token);

                            foreach (var message in messages)
                            {
                                using var deadline = CancellationTokenSource.CreateLinkedTokenSource(sessionCts.Token);
                                deadline.CancelAfter(PublishTimeout);

                                await publishChannel.BasicPublishAsync(
                                    exchange: "",
                                    routingKey: config.JobQueue,
                                    mandatory: true,
                                    basicProperties: new BasicProperties
                                    {
                                        Persistent = true,
                                        ContentType = "application/json",
                                        MessageId = message.Id.ToString()
                                    },
                                    body: Encoding.UTF8.GetBytes(message.Payload),
                                    cancellationToken: deadline.Token);

                                db.JobOutbox.Remove(message);
                                await db.SaveChangesAsync(sessionCts.Token);
                            }

                            hasMoreOutbox = messages.Count == OutboxBatchSize;
                        }

                        if (!hasMoreOutbox)
                        {
                            await dispatcherSignal.WaitAsync(pollInterval, sessionCts.Token);
                        }
                    }

                    if (!stoppingToken.IsCancellationRequested)
                    {
                        logger.LogWarning("Job transport disconnected; durable jobs will be retried");
                        shouldBackoff = true;
                    }
                }
                finally
                {
                    connection.ConnectionShutdownAsync -= OnShutdown;
                    publishChannel.ChannelShutdownAsync -= OnShutdown;
                    consumerChannel.ChannelShutdownAsync -= OnShutdown;
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception error)
            {
                logger.LogWarning(error, "Job transport disconnected; durable jobs will be retried");
                shouldBackoff = true;
            }

            if (shouldBackoff && !stoppingToken.IsCancellationRequested)
            {
                try { await Task.Delay(ReconnectBackoff, stoppingToken); }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            }
        }
    }

    private static void CancelQuietly(CancellationTokenSource cts)
    {
        try
        {
            cts.Cancel();
        }
        catch (ObjectDisposedException)
        {
        }
    }
}
