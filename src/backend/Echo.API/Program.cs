using Echo.API.Extensions;
using Echo.API.Middlewares;
using Echo.API.Services;
using Echo.Application.Interfaces;
using Echo.Application.Services;
using Echo.Application.Options;
using Echo.Infrastructure.Extensions;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApiDocumentation();

builder.Services.AddOptions<Auth0Options>()
    .BindConfiguration(Auth0Options.SectionName)
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.AddAuth0Authentication();
builder.Services.AddAuthorization();
builder.Services.AddInfrastructure(builder.Configuration);

builder.Services.AddScoped<IIdentityService, IdentityService>();
builder.Services.AddScoped<IRecordingService, RecordingService>();
builder.Services.AddSingleton<IAudioContentValidator, AudioContentValidator>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUserAccessor, CurrentUserAccessor>();

builder.Services.AddControllers();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.UseMiddleware<CurrentUserMiddleware>();

app.MapControllers();

app.Run();
