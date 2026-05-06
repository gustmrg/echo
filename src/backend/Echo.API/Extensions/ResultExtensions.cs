using Echo.Domain.Common;
using Microsoft.AspNetCore.Mvc;

namespace Echo.API.Extensions;

public static class ResultExtensions
{
    public static IActionResult ToActionResult(this Result result) =>
        result.IsSuccess
            ? new OkResult()
            : new BadRequestObjectResult(new { error = result.Error });

    public static IActionResult ToActionResult<T>(this Result<T> result, Func<T, IActionResult> onSuccess) =>
        result.IsSuccess
            ? onSuccess(result.Value)
            : new BadRequestObjectResult(new { error = result.Error });
}
