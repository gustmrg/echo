using System.Text;
using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using Echo.API.Extensions;
using Echo.API.Storage;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Echo.API.Tests.Storage;

public sealed class LocalFileStorageTests : IDisposable
{
    private readonly string _rootPath = Path.Combine(
        Path.GetTempPath(),
        "echo-api-tests",
        Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task UploadAndDeleteAsync_StoresFileUnderConfiguredRoot()
    {
        var storage = CreateStorage();
        var contents = Encoding.UTF8.GetBytes("test audio");
        var key = storage.CreateFileKey("capture.WEBM", FileStorageContext.AudioRecording, "recording-id");

        await using var input = new MemoryStream(contents);
        await storage.UploadAsync(key, input, "audio/webm", CancellationToken.None);

        var storedPath = Path.Combine(_rootPath, key.Replace('/', Path.DirectorySeparatorChar));
        Assert.True(File.Exists(storedPath));
        Assert.Equal(contents, await File.ReadAllBytesAsync(storedPath, CancellationToken.None));
        Assert.EndsWith(".webm", key, StringComparison.Ordinal);

        await storage.DeleteAsync(key, CancellationToken.None);

        Assert.False(File.Exists(storedPath));
    }

    [Theory]
    [InlineData("../outside.webm")]
    [InlineData("recordings/../../outside.webm")]
    public async Task UploadAsync_RejectsKeysOutsideConfiguredRoot(string key)
    {
        var storage = CreateStorage();
        await using var input = new MemoryStream([1, 2, 3]);

        await Assert.ThrowsAsync<ArgumentException>(() =>
            storage.UploadAsync(key, input, "audio/webm", CancellationToken.None));
    }

    [Fact]
    public void AddFileStorage_SelectsLocalProvider()
    {
        var values = new Dictionary<string, string?>
        {
            ["Storage:Provider"] = "Local",
            ["Storage:Local:RootPath"] = _rootPath,
        };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddFileStorage(configuration);

        using var provider = services.BuildServiceProvider();

        Assert.IsType<LocalFileStorage>(provider.GetRequiredService<IFileStorage>());
    }

    [Fact]
    public void AddFileStorage_SelectsS3Provider()
    {
        var values = new Dictionary<string, string?>
        {
            ["Storage:Provider"] = "S3",
            ["Storage:S3:BucketName"] = "echo-production",
            ["Storage:S3:Region"] = "us-east-1",
        };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddFileStorage(configuration);
        services.AddSingleton<IAmazonS3>(
            new AmazonS3Client(new AnonymousAWSCredentials(), RegionEndpoint.USEast1));

        using var provider = services.BuildServiceProvider();

        Assert.IsType<S3FileStorage>(provider.GetRequiredService<IFileStorage>());
    }

    public void Dispose()
    {
        if (Directory.Exists(_rootPath))
            Directory.Delete(_rootPath, recursive: true);
    }

    private LocalFileStorage CreateStorage()
    {
        var options = Options.Create(new StorageOptions
        {
            Provider = StorageProvider.Local,
            Local = new LocalStorageOptions { RootPath = _rootPath },
        });

        return new LocalFileStorage(options);
    }
}
