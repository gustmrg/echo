using Echo.Domain.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace Echo.API.Controllers;

[ApiController]
public class RecordingsController : ControllerBase
{
    private readonly IFileStorageService _fileStorage;
    
    public RecordingsController(IFileStorageService fileStorage)
    {
        _fileStorage = fileStorage;
    }
    
    [HttpPost("/upload")]
    public async Task<IActionResult> Upload(IFormFile file)
    {
        if (file.Length == 0)
            return BadRequest();
        
        await using var stream = file.OpenReadStream();
        
        var recordingId = Guid.CreateVersion7().ToString();
        await _fileStorage.UploadFileAsync(
            stream, 
            file.FileName, 
            file.ContentType, 
            FileStorageContext.AudioRecording, 
            recordingId);
        
        return Ok();
    }
}