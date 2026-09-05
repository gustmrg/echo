using Echo.API.Extensions;
using Echo.API.Features.Recordings;
using Scalar.AspNetCore;
using Echo.API.Features.Refinements;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddInfrastructure(builder.Configuration);

builder.Services.AddOpenApi();
builder.Services.AddEndpointsApiExplorer();

var app = builder.Build();

await app.ApplyMigrationsAsync();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.UseHttpsRedirection();

var api = app.MapGroup("api");
api.MapRecordings();
api.MapRefinements();

app.Run();

public partial class Program;
