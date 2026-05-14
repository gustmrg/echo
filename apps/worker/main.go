package main

import (
	"context"
	"log"
	"os/signal"
	"syscall"
	"time"

	"github.com/gustmrg/echo/apps/worker/internal/config"
	"github.com/gustmrg/echo/apps/worker/internal/db"
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
		processJob(ctx, store, job)
	}
}

func processJob(ctx context.Context, store *db.Store, job *db.TranscriptionJob) {
	// TODO: download audio from S3, call Whisper API
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
