using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Echo.API.Controllers;

[ApiController]
public class IdentityController : ControllerBase
{
    public IdentityController()
    {
        
    }
    
    [HttpPost("register")]
    public IActionResult Register()
    {
        return Ok();
    }
    
    [HttpPost("login")]
    public IActionResult Login()
    {
        return Ok();
    }
    
    [Authorize]
    [HttpGet("me")]
    public IActionResult GetMe()
    {
        return Ok();
    }
}