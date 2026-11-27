using Echo.API.Extensions;
using Echo.API.Features.Jobs;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Echo.API.Tests.Jobs;

public sealed class JobDispatcherSignalTests
{
    [Theory]
    [InlineData(0)]
    [InlineData(-10)]
    public void RabbitOptions_RejectsNonPositiveProcessingTimeoutSeconds(int timeoutSeconds)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = "Data Source=:memory:",
                ["Storage:Provider"] = "Local",
                ["Storage:Local:RootPath"] = Path.GetTempPath(),
                ["RabbitMQ:ProcessingTimeoutSeconds"] = timeoutSeconds.ToString()
            })
            .Build();

        var services = new ServiceCollection();
        services.AddInfrastructure(configuration);

        using var provider = services.BuildServiceProvider();
        Assert.Throws<OptionsValidationException>(() => provider.GetRequiredService<IOptions<RabbitOptions>>().Value);
    }

    [Fact]
    public async Task Notify_CoalescesMultipleSignalsWithoutBlocking()
    {
        var signal = new JobDispatcherSignal();

        for (var i = 0; i < 50; i++)
        {
            signal.Notify();
        }

        // Exactly one coalesced signal should be immediately readable.
        await signal.WaitAsync(TimeSpan.FromSeconds(5), CancellationToken.None).WaitAsync(TimeSpan.FromSeconds(1));

        // No extra queued signals should remain after consuming the coalesced one.
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(50));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => signal.WaitAsync(cts.Token));
    }

    [Fact]
    public async Task WaitAsync_WakesImmediatelyWhenNotified()
    {
        var signal = new JobDispatcherSignal();
        var waitTask = signal.WaitAsync(TimeSpan.FromSeconds(30), CancellationToken.None);

        Assert.False(waitTask.IsCompleted);

        signal.Notify();

        await waitTask.WaitAsync(TimeSpan.FromSeconds(2));
    }

    [Fact]
    public async Task WaitAsync_ReturnsWhenTimeoutElapsesWithoutSignal()
    {
        var signal = new JobDispatcherSignal();

        await signal.WaitAsync(TimeSpan.FromMilliseconds(25), CancellationToken.None).WaitAsync(TimeSpan.FromSeconds(2));
    }

    [Fact]
    public async Task WaitAsync_PropagatesCancellation()
    {
        var signal = new JobDispatcherSignal();
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => signal.WaitAsync(TimeSpan.FromSeconds(10), cts.Token));
    }
}
