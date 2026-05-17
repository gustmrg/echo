using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Echo.API.Database.Migrations
{
    /// <inheritdoc />
    public partial class Initial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "recordings",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "TEXT", nullable: false),
                    title = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    status = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    file_name = table.Column<string>(type: "TEXT", maxLength: 255, nullable: false),
                    file_size_bytes = table.Column<int>(type: "INTEGER", nullable: false),
                    content_type = table.Column<string>(type: "TEXT", maxLength: 100, nullable: true),
                    s3_key = table.Column<string>(type: "TEXT", maxLength: 1024, nullable: true),
                    created_at = table.Column<DateTime>(type: "TEXT", nullable: false),
                    updated_at = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_recordings", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "transcription_jobs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "TEXT", nullable: false),
                    recording_id = table.Column<Guid>(type: "TEXT", nullable: false),
                    raw_text = table.Column<string>(type: "TEXT", nullable: true),
                    status = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    created_at = table.Column<DateTime>(type: "TEXT", nullable: false),
                    updated_at = table.Column<DateTime>(type: "TEXT", nullable: true),
                    retry_count = table.Column<int>(type: "INTEGER", nullable: false),
                    failure_reason = table.Column<string>(type: "TEXT", maxLength: 2048, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_transcription_jobs", x => x.id);
                    table.ForeignKey(
                        name: "fk_transcription_jobs_recordings_recording_id",
                        column: x => x.recording_id,
                        principalTable: "recordings",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_transcription_jobs_recording_id",
                table: "transcription_jobs",
                column: "recording_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "transcription_jobs");

            migrationBuilder.DropTable(
                name: "recordings");
        }
    }
}
