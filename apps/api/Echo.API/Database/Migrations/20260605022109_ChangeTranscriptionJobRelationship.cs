using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Echo.API.Database.Migrations
{
    /// <inheritdoc />
    public partial class ChangeTranscriptionJobRelationship : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_transcription_jobs_recording_id",
                table: "transcription_jobs");

            migrationBuilder.DropColumn(
                name: "raw_text",
                table: "transcription_jobs");

            migrationBuilder.AddColumn<string>(
                name: "transcribed_text",
                table: "recordings",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_transcription_jobs_recording_id",
                table: "transcription_jobs",
                column: "recording_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_transcription_jobs_recording_id",
                table: "transcription_jobs");

            migrationBuilder.DropColumn(
                name: "transcribed_text",
                table: "recordings");

            migrationBuilder.AddColumn<string>(
                name: "raw_text",
                table: "transcription_jobs",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_transcription_jobs_recording_id",
                table: "transcription_jobs",
                column: "recording_id");
        }
    }
}
