using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Echo.API.Database.Migrations
{
    /// <inheritdoc />
    public partial class ChangeRecordingFileSizeBytesToLong : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<long>(
                name: "file_size_bytes",
                table: "recordings",
                type: "INTEGER",
                nullable: false,
                oldClrType: typeof(int),
                oldType: "INTEGER");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "file_size_bytes",
                table: "recordings",
                type: "INTEGER",
                nullable: false,
                oldClrType: typeof(long),
                oldType: "INTEGER");
        }
    }
}
