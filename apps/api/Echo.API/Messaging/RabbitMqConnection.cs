using RabbitMQ.Client;

namespace Echo.API.Messaging;

public sealed class RabbitMqConnection : IAsyncDisposable
{
    private readonly IConnectionFactory _connectionFactory;
    private IConnection? _connection;

    public RabbitMqConnection(IConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }
    
    public async Task<IConnection> GetConnectionAsync(CancellationToken cancellationToken = default)
    {
        if (_connection is { IsOpen: true })
            return _connection;

        _connection = await _connectionFactory.CreateConnectionAsync(
            clientProvidedName: "echo-api",
            cancellationToken);

        return _connection;
    }
    
    public async ValueTask DisposeAsync()
    {
        if (_connection is not null)
            await _connection.DisposeAsync();
    }
}