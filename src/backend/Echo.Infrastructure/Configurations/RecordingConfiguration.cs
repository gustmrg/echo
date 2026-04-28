using Echo.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Echo.Infrastructure.Configurations;

public class RecordingConfiguration : IEntityTypeConfiguration<Recording>
{
    public void Configure(EntityTypeBuilder<Recording> builder)
    {
        builder.HasKey(r => r.Id);

        builder.Property(r => r.UserId)
            .IsRequired();

        builder.Property(r => r.Status)
            .IsRequired()
            .HasConversion<string>()
            .HasMaxLength(32);

        builder.Property(r => r.S3Key)
            .HasMaxLength(1024);

        builder.Property(r => r.S3Url)
            .HasMaxLength(2048);

        builder.Property(r => r.FileSizeBytes)
            .IsRequired();

        builder.Property(r => r.FileExtension)
            .HasMaxLength(16);

        builder.Property(r => r.DurationInSeconds)
            .IsRequired();

        builder.Property(r => r.CreatedAt)
            .IsRequired();

        builder.Property(r => r.FailureReason)
            .HasMaxLength(1024);

        builder.HasIndex(r => r.UserId);
        builder.HasIndex(r => r.Status);
        builder.HasIndex(r => r.CreatedAt);
    }
}
