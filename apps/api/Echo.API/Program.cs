using Echo.API.Extensions;
using Echo.API.Features.Health;
using Echo.API.Features.Recordings;
using Echo.API.Features.Refinements;
using Echo.API.Shared;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddInfrastructure(builder.Configuration);

builder.Services.AddOpenApi();
builder.Services.AddEndpointsApiExplorer();

var app = builder.Build();

await app.ApplyMigrationsAsync();

app.UseCorrelationId();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.UseHttpsRedirection();

app.MapHealth();

var api = app.MapGroup("api");
api.MapRecordings();
api.MapRefinements();

app.Run();

public partial class Program;
