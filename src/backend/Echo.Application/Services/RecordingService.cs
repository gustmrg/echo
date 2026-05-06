using Echo.Application.Interfaces;
using Echo.Domain.Common;
using Echo.Domain.Entities;
using Echo.Domain.Interfaces;
using Microsoft.Extensions.Logging;

namespace Echo.Application.Services;

public class RecordingService : IRecordingService
{
    private readonly IFileStorageService _fileStorage;
    private readonly IAudioContentValidator _contentValidator;
    private readonly IRecordingRepository _recordings;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<RecordingService> _logger;

    public RecordingService(
        IFileStorageService fileStorage,
        IAudioContentValidator contentValidator,
        IRecordingRepository recordings,
        IUnitOfWork unitOfWork,
        ILogger<RecordingService> logger)
    {
        _fileStorage = fileStorage;
        _contentValidator = contentValidator;
        _recordings = recordings;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public async Task<Result<Recording>> UploadAsync(
        Guid userId,
        Stream fileStream,
        string fileName,
        string contentType,
        long fileSizeBytes,
        CancellationToken cancellationToken = default)
    {
        if (fileSizeBytes <= 0)
            return Result.Failure<Recording>(RecordingErrors.FileEmpty);

        if (fileSizeBytes > int.MaxValue)
            return Result.Failure<Recording>(RecordingErrors.FileSizeExceeded);

        var extension = Path.GetExtension(fileName);

        var contentCheck = await _contentValidator.ValidateAsync(fileStream, extension, cancellationToken);
        if (contentCheck.IsFailure)
            return Result.Failure<Recording>(contentCheck.Error!);

        var createResult = Recording.Create(userId, (int)fileSizeBytes, extension);
        if (createResult.IsFailure)
            return createResult;

        var recording = createResult.Value;

        await _recordings.AddAsync(recording, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        string s3Key;
        try
        {
            s3Key = await _fileStorage.UploadFileAsync(
                fileStream,
                fileName,
                contentType,
                FileStorageContext.AudioRecording,
                recording.Id.ToString());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "S3 upload failed for recording {RecordingId}", recording.Id);
            recording.MarkFailed(Truncate(ex.Message, 1024));
            await _unitOfWork.SaveChangesAsync(CancellationToken.None);
            return Result.Failure<Recording>(RecordingErrors.UploadFailed);
        }

        var s3Url = _fileStorage.GetFileUrl(s3Key) ?? string.Empty;
        var attach = recording.AttachS3Key(s3Key, s3Url);
        if (attach.IsFailure)
        {
            _logger.LogError("Unexpected status transition failure for recording {RecordingId}: {Error}",
                recording.Id, attach.Error);

            await DeleteUploadedFileAsync(s3Key);
            recording.MarkFailed(attach.Error!);
            await _unitOfWork.SaveChangesAsync(CancellationToken.None);

            return Result.Failure<Recording>(attach.Error!);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(recording);
    }

    private async Task DeleteUploadedFileAsync(string s3Key)
    {
        try
        {
            await _fileStorage.DeleteFileAsync(s3Key);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to delete uploaded file {S3Key} after recording state failure", s3Key);
        }
    }

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value[..max];
}
