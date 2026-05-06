using Echo.API.Contracts.Recordings;
using Echo.API.Services;
using Echo.Application.Interfaces;
using Echo.Domain.Common;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Echo.API.Controllers;

[ApiController]
public class RecordingsController : ControllerBase
{
    private readonly IRecordingService _recordingService;
    private readonly ICurrentUserAccessor _currentUserAccessor;

    public RecordingsController(IRecordingService recordingService, ICurrentUserAccessor currentUserAccessor)
    {
        _recordingService = recordingService;
        _currentUserAccessor = currentUserAccessor;
    }

    [Authorize]
    [HttpPost("/upload")]
    public async Task<IActionResult> Upload(IFormFile? file, CancellationToken cancellationToken)
    {
        if (file is null)
            return BadRequest(new { error = RecordingErrors.FileMissing });

        if (file.Length == 0)
            return BadRequest(new { error = RecordingErrors.FileEmpty });

        var currentUser = _currentUserAccessor.CurrentUser;
        if (currentUser is null)
            return Unauthorized(new { error = RecordingErrors.Unauthenticated });

        await using var stream = file.OpenReadStream();

        var result = await _recordingService.UploadAsync(
            currentUser.Id,
            stream,
            file.FileName,
            file.ContentType,
            file.Length,
            cancellationToken);

        return result.IsSuccess
            ? CreatedAtAction(nameof(Upload), new { id = result.Value.Id }, RecordingResponse.From(result.Value))
            : ToErrorResponse(result.Error!);
    }

    private IActionResult ToErrorResponse(string error) =>
        IsValidationError(error)
            ? BadRequest(new { error })
            : Problem(statusCode: StatusCodes.Status500InternalServerError, detail: error);

    private static bool IsValidationError(string error) =>
        error == RecordingErrors.FileEmpty ||
        error == RecordingErrors.FileSizeExceeded ||
        error == RecordingErrors.UnreadableStream ||
        error.StartsWith("File contents", StringComparison.Ordinal) ||
        error.StartsWith("File type", StringComparison.Ordinal);
}
