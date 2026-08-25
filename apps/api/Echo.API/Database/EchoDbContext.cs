using Echo.API.Entities;
using Echo.API.Enums;
using Microsoft.EntityFrameworkCore;
namespace Echo.API.Database;

public class EchoDbContext(DbContextOptions<EchoDbContext> options) : DbContext(options)
{
    public DbSet<Recording> Recordings => Set<Recording>();
    public DbSet<TranscriptionJob> TranscriptionJobs => Set<TranscriptionJob>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Recording>(entity =>
        {
            entity.ToTable("recordings");

            entity.HasKey(recording => recording.Id);

            entity.Property(recording => recording.Id)
                .ValueGeneratedNever();

            entity.Property(recording => recording.Title)
                .HasMaxLength(200);

            entity.Property(recording => recording.Status)
                .HasConversion(
                    v => v.ToString().ToLowerInvariant(),
                    v => Enum.Parse<RecordingStatus>(v, true))
                .HasMaxLength(32)
                .IsRequired();

            // TODO: Add a validation for filename when recording is uploaded
            entity.Property(recording => recording.FileName)
                .HasMaxLength(255)
                .IsRequired();

            entity.Property(recording => recording.FileSizeBytes)
                .IsRequired();

            entity.Property(recording => recording.ContentType)
                .HasMaxLength(100);

            entity.Property(recording => recording.S3Key)
                .HasColumnName("s3_key")
                .HasMaxLength(1024);

            entity.Property(recording => recording.TranscribedText);

            entity.Property(recording => recording.CreatedAt)
                .IsRequired();

            entity.Property(recording => recording.UpdatedAt);
        });

        modelBuilder.Entity<TranscriptionJob>(entity =>
        {
            entity.ToTable("transcription_jobs");

            entity.HasKey(transcriptionJob => transcriptionJob.Id);

            entity.Property(transcriptionJob => transcriptionJob.Id)
                .ValueGeneratedNever();

            entity.Property(transcriptionJob => transcriptionJob.RecordingId)
                .ValueGeneratedNever();

            entity.HasIndex(transcriptionJob => transcriptionJob.RecordingId)
                .IsUnique();

            entity.Property(transcriptionJob => transcriptionJob.Status)
                .HasConversion(
                    v => v.ToString().ToLowerInvariant(),
                    v => Enum.Parse<JobStatus>(v, true))
                .HasMaxLength(32)
                .IsRequired();

            entity.Property(transcriptionJob => transcriptionJob.CreatedAt)
                .IsRequired();

            entity.Property(transcriptionJob => transcriptionJob.UpdatedAt);

            entity.Property(transcriptionJob => transcriptionJob.RetryCount)
                .IsRequired();

            entity.Property(transcriptionJob => transcriptionJob.FailureReason)
                .HasMaxLength(2048);

            entity.HasOne(transcriptionJob => transcriptionJob.Recording)
                .WithOne(recording => recording.TranscriptionJob)
                .HasForeignKey<TranscriptionJob>(transcriptionJob => transcriptionJob.RecordingId)
                .IsRequired()
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
