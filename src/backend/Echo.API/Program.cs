using Echo.API.Extensions;
using Echo.API.Middlewares;
using Echo.Application.Interfaces;
using Echo.Application.Services;
using Echo.Application.Options;
using Echo.Domain.Interfaces;
using Echo.Infrastructure;
using Echo.Infrastructure.Options;
using Echo.Infrastructure.Repositories;
using Echo.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApiDocumentation();

builder.Services.AddOptions<JwtOptions>()
    .BindConfiguration(JwtOptions.SectionName)
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.AddOptions<Auth0Options>()
    .BindConfiguration(Auth0Options.SectionName)
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.AddOptions<S3Options>()
    .BindConfiguration(S3Options.SectionName)
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.AddAuth0Authentication();
builder.Services.AddAuthorization();

builder.Services.AddDbContext<AppDbContext>(options => 
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection"))
        .UseSnakeCaseNamingConvention());

builder.Services.AddScoped<IUnitOfWork>(sp => sp.GetRequiredService<AppDbContext>());
builder.Services.AddScoped<IUserRepository, UserRepository>();

builder.Services.AddScoped<IIdentityService, IdentityService>();
builder.Services.AddScoped<IFileStorageService, S3FileStorageService>();

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

app.Run();
