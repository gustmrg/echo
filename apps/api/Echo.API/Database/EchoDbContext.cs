using Echo.API.Entities;
using Microsoft.EntityFrameworkCore;

namespace Echo.API.Database;

public class EchoDbContext(DbContextOptions<EchoDbContext> options) : DbContext(options)
{
    public DbSet<Recording> Recordings => Set<Recording>();
}
