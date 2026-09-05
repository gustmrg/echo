using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Echo.API.Database.Migrations
{
    /// <inheritdoc />
    public partial class RabbitJobOutbox : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Stop old SQLite workers before migration. Recover their in-flight jobs
            // once; after this migration RabbitMQ owns delivery and redelivery.
            migrationBuilder.Sql("UPDATE transcription_jobs SET status = 'created', claim_token = NULL, next_attempt_at = NULL WHERE status = 'processing'");
            migrationBuilder.Sql("UPDATE recordings SET status = 'pending' WHERE status = 'transcribing'");
            migrationBuilder.Sql("UPDATE refinement_jobs SET status = 'created', claim_token = NULL, next_attempt_at = NULL WHERE status = 'processing'");
            migrationBuilder.CreateTable(
                name: "job_outbox",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "TEXT", nullable: false),
                    payload = table.Column<string>(type: "TEXT", nullable: false),
                    created_at = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_job_outbox", x => x.id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "job_outbox");
        }
    }
}
