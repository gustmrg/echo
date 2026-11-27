namespace Echo.API.Features.Jobs;

public sealed record RabbitHealthSnapshot(
    bool IsConnected,
    DateTimeOffset? LastConnectedAt,
    string? LastError);

public interface IRabbitHealthState
{
    bool IsConnected { get; }
    DateTimeOffset? LastConnectedAt { get; }
    string? LastError { get; }
    RabbitHealthSnapshot GetSnapshot();
    void MarkConnected();
    void MarkDisconnected(string? error = null);
}

public sealed class RabbitHealthState : IRabbitHealthState
{
    private readonly Lock _gate = new();
    private RabbitHealthSnapshot _snapshot = new(false, null, null);

    public bool IsConnected => GetSnapshot().IsConnected;
    public DateTimeOffset? LastConnectedAt => GetSnapshot().LastConnectedAt;
    public string? LastError => GetSnapshot().LastError;

    public RabbitHealthSnapshot GetSnapshot()
    {
        lock (_gate)
        {
            return _snapshot;
        }
    }

    public void MarkConnected()
    {
        lock (_gate)
        {
            _snapshot = new RabbitHealthSnapshot(true, DateTimeOffset.UtcNow, null);
        }
    }

    public void MarkDisconnected(string? error = null)
    {
        lock (_gate)
        {
            _snapshot = new RabbitHealthSnapshot(false, _snapshot.LastConnectedAt, error);
        }
    }
}
