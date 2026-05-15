package main

import (
	"context"
	"log"
	"os/signal"
	"syscall"
	"time"

	"github.com/gustmrg/echo/apps/worker/internal/config"
	"github.com/gustmrg/echo/apps/worker/internal/db"
	"github.com/gustmrg/echo/apps/worker/internal/storage"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	conn, err := db.New(cfg.DBPath)
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()

	store := db.NewStore(conn)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	log.Println("worker started")

	for {
		select {
		case <-ctx.Done():
			log.Println("shutting down")
			return
		default:
		}

		job, err := store.GetNextPendingJob(ctx)
		if err != nil {
			log.Printf("error fetching job: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}

		if job == nil {
			log.Println("no pending jobs, sleeping")
			time.Sleep(5 * time.Second)
			continue
		}

		log.Printf("processing job %s (recording %s)", job.ID, job.RecordingID)

		storage, err := storage.NewS3Storage(ctx, storage.S3Config(cfg.Storage))
		if err != nil {
			log.Printf("error creating storage: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}

		processJob(ctx, store, storage, job)
	}
}

func processJob(ctx context.Context, store *db.Store, storage *storage.S3Storage, job *db.TranscriptionJob) {
	// TODO: download audio from S3, call Whisper API
	recording, err := store.GetRecordingByID(ctx, job.RecordingID)
	if err != nil {
		failJob(ctx, store, job.ID, "error loading recording: "+err.Error())
		log.Printf("error loading recording %s for transcription job %s: %v", job.RecordingID, job.ID, err)
		return
	}
	if recording == nil {
		reason := "recording not found"
		failJob(ctx, store, job.ID, reason)
		log.Printf("recording %s not found for transcription job %s", job.RecordingID, job.ID)
		return
	}
	if recording.S3Key == nil || *recording.S3Key == "" {
		reason := "recording has no s3 key"
		failJob(ctx, store, job.ID, reason)
		log.Printf("recording %s has no s3 key for transcription job %s", recording.ID, job.ID)
		return
	}

	file, err := storage.Download(ctx, *recording.S3Key)
	if err != nil {
		failJob(ctx, store, job.ID, "error downloading file: "+err.Error())
		log.Printf("error downloading file %s: %v", *recording.S3Key, err)
		return
	}
	log.Printf("downloaded %d bytes from %s for job %s", len(file), *recording.S3Key, job.ID)

	if err := store.MarkJobCompleted(ctx, job.ID, ""); err != nil {
		log.Printf("error marking job %s completed: %v", job.ID, err)
		return
	}

	if err := store.UpdateRecordingStatus(ctx, job.RecordingID, db.RecordingStatusTranscribed); err != nil {
		log.Printf("error updating recording %s status: %v", job.RecordingID, err)
		return
	}

	log.Printf("job %s completed", job.ID)
}

func failJob(ctx context.Context, store *db.Store, jobID string, reason string) {
	if err := store.MarkJobFailed(ctx, jobID, reason); err != nil {
		log.Printf("error marking job %s failed: %v", jobID, err)
	}
}
