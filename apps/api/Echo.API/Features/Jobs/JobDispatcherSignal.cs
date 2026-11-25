using System.Threading.Channels;

namespace Echo.API.Features.Jobs;

public interface IJobDispatcherSignal
{
    void Notify();
    Task WaitAsync(CancellationToken ct);
    Task WaitAsync(TimeSpan timeout, CancellationToken ct);
}

public sealed class JobDispatcherSignal : IJobDispatcherSignal
{
    private readonly Channel<bool> _channel = Channel.CreateBounded<bool>(
        new BoundedChannelOptions(1)
        {
            FullMode = BoundedChannelFullMode.DropWrite,
            SingleReader = false,
            SingleWriter = false
        });

    public void Notify() => _channel.Writer.TryWrite(true);

    public async Task WaitAsync(CancellationToken ct)
    {
        await _channel.Reader.ReadAsync(ct);
    }

    public async Task WaitAsync(TimeSpan timeout, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();

        if (_channel.Reader.TryRead(out _))
            return;

        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeoutCts.CancelAfter(timeout);

        try
        {
            await _channel.Reader.ReadAsync(timeoutCts.Token);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            // Poll interval elapsed without an explicit signal.
        }
    }
}
