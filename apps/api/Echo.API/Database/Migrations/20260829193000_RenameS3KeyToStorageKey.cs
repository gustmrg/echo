using Echo.API.Database;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Echo.API.Database.Migrations;

[DbContext(typeof(EchoDbContext))]
[Migration("20260829193000_RenameS3KeyToStorageKey")]
public partial class RenameS3KeyToStorageKey : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.RenameColumn(
            name: "s3_key",
            table: "recordings",
            newName: "storage_key");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.RenameColumn(
            name: "storage_key",
            table: "recordings",
            newName: "s3_key");
    }
}
