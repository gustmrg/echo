namespace Echo.API.Messaging;

public interface IMessagePublisher
{
    Task PublishAsync<T>(string exchange, string queue, string routingKey, T message, CancellationToken ct = default);
}