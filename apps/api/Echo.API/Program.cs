using Echo.API.Database;
using Echo.API.Features.Recordings;
using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<EchoDbContext>(options =>
{
    if (builder.Environment.IsDevelopment())
    {
        var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
        options.UseSqlite(connectionString);
    }
});

builder.Services.AddOpenApi();
builder.Services.AddEndpointsApiExplorer();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.UseHttpsRedirection();

app.MapRecordings();

app.Run();
