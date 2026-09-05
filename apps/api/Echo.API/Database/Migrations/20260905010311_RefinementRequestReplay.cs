using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Echo.API.Database.Migrations
{
    /// <inheritdoc />
    public partial class RefinementRequestReplay : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "refinement_requests",
                columns: table => new
                {
                    recording_id = table.Column<Guid>(type: "TEXT", nullable: false),
                    request_key = table.Column<string>(type: "TEXT", nullable: false),
                    job_id = table.Column<Guid>(type: "TEXT", nullable: false),
                    format = table.Column<string>(type: "TEXT", nullable: false),
                    transcript_revision = table.Column<int>(type: "INTEGER", nullable: false),
                    regenerate = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_refinement_requests", x => new { x.recording_id, x.request_key });
                    table.ForeignKey(
                        name: "fk_refinement_requests_refinement_jobs_job_id",
                        column: x => x.job_id,
                        principalTable: "refinement_jobs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_refinement_requests_job_id",
                table: "refinement_requests",
                column: "job_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "refinement_requests");
        }
    }
}
