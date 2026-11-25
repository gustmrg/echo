using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Echo.API.Database.Migrations
{
    /// <inheritdoc />
    public partial class AddJobCorrelationId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "correlation_id",
                table: "transcription_jobs",
                type: "TEXT",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "correlation_id",
                table: "refinement_jobs",
                type: "TEXT",
                maxLength: 64,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "correlation_id",
                table: "transcription_jobs");

            migrationBuilder.DropColumn(
                name: "correlation_id",
                table: "refinement_jobs");
        }
    }
}
