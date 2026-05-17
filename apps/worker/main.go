package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"mime"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/gustmrg/echo/apps/worker/internal/config"
	"github.com/gustmrg/echo/apps/worker/internal/db"
	"github.com/gustmrg/echo/apps/worker/internal/storage"
	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
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

	contentType := ""
	if recording.ContentType != nil {
		contentType = *recording.ContentType
	}

	transcript, err := TranscribeAudio(ctx, bytes.NewReader(file), recording.FileName, contentType)
	if err != nil {
		failJob(ctx, store, job.ID, "error transcribing file: "+err.Error())
		log.Printf("error transcribing recording %s for job %s: %v", recording.ID, job.ID, err)
		return
	}

	if err := store.MarkJobCompleted(ctx, job.ID, transcript); err != nil {
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

type audioFile struct {
	io.Reader
	filename    string
	contentType string
}

func (f audioFile) Filename() string {
	return f.filename
}

func (f audioFile) ContentType() string {
	return f.contentType
}

func TranscribeAudio(ctx context.Context, r io.Reader, filename, contentType string) (string, error) {
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("OPENAI_API_KEY is not set")
	}

	client := openai.NewClient(
		option.WithAPIKey(apiKey),
	)

	if contentType == "" {
		contentType = mime.TypeByExtension(filepath.Ext(filename))
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	resp, err := client.Audio.Transcriptions.New(ctx, openai.AudioTranscriptionNewParams{
		File: audioFile{
			Reader:      r,
			filename:    filename,
			contentType: contentType,
		},
		Model:          openai.AudioModelGPT4oTranscribe,
		ResponseFormat: openai.AudioResponseFormatJSON,
	})
	if err != nil {
		return "", fmt.Errorf("openai transcription failed: %w", err)
	}

	return resp.Text, nil
}
