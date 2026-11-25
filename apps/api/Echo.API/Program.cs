using Echo.API.Extensions;
using Echo.API.Features.Auth;
using Echo.API.Features.Recordings;
using Echo.API.Features.Refinements;
using Scalar.AspNetCore;

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
app.UseAuthentication();
app.UseAuthorization();

var api = app.MapGroup("api");
api.MapAuth();
api.MapRecordings();
api.MapRefinements();

app.Run();

public partial class Program;
