using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Echo.API.Database.Migrations
{
    /// <inheritdoc />
    public partial class CompleteWorkflow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "attempt_count",
                table: "transcription_jobs",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "claim_token",
                table: "transcription_jobs",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "next_attempt_at",
                table: "transcription_jobs",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "edited_text",
                table: "recordings",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "transcript_revision",
                table: "recordings",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "upload_hash",
                table: "recordings",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "upload_key",
                table: "recordings",
                type: "TEXT",
                maxLength: 36,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "refinement_jobs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "TEXT", nullable: false),
                    recording_id = table.Column<Guid>(type: "TEXT", nullable: false),
                    request_key = table.Column<string>(type: "TEXT", nullable: false),
                    format = table.Column<string>(type: "TEXT", nullable: false),
                    transcript_revision = table.Column<int>(type: "INTEGER", nullable: false),
                    source_text = table.Column<string>(type: "TEXT", nullable: false),
                    status = table.Column<string>(type: "TEXT", nullable: false),
                    content = table.Column<string>(type: "TEXT", nullable: true),
                    model = table.Column<string>(type: "TEXT", nullable: true),
                    provider = table.Column<string>(type: "TEXT", nullable: true),
                    prompt_version = table.Column<string>(type: "TEXT", nullable: true),
                    failure_reason = table.Column<string>(type: "TEXT", nullable: true),
                    claim_token = table.Column<string>(type: "TEXT", nullable: true),
                    attempt_count = table.Column<int>(type: "INTEGER", nullable: false),
                    next_attempt_at = table.Column<DateTime>(type: "TEXT", nullable: true),
                    created_at = table.Column<DateTime>(type: "TEXT", nullable: false),
                    updated_at = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_refinement_jobs", x => x.id);
                    table.ForeignKey(
                        name: "fk_refinement_jobs_recordings_recording_id",
                        column: x => x.recording_id,
                        principalTable: "recordings",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_recordings_upload_key",
                table: "recordings",
                column: "upload_key",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_refinement_jobs_recording_id_request_key",
                table: "refinement_jobs",
                columns: new[] { "recording_id", "request_key" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_refinement_jobs_recording_id_transcript_revision_format",
                table: "refinement_jobs",
                columns: new[] { "recording_id", "transcript_revision", "format" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "refinement_jobs");

            migrationBuilder.DropIndex(
                name: "ix_recordings_upload_key",
                table: "recordings");

            migrationBuilder.DropColumn(
                name: "attempt_count",
                table: "transcription_jobs");

            migrationBuilder.DropColumn(
                name: "claim_token",
                table: "transcription_jobs");

            migrationBuilder.DropColumn(
                name: "next_attempt_at",
                table: "transcription_jobs");

            migrationBuilder.DropColumn(
                name: "edited_text",
                table: "recordings");

            migrationBuilder.DropColumn(
                name: "transcript_revision",
                table: "recordings");

            migrationBuilder.DropColumn(
                name: "upload_hash",
                table: "recordings");

            migrationBuilder.DropColumn(
                name: "upload_key",
                table: "recordings");
        }
    }
}
