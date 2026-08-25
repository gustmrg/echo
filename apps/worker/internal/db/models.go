package db

import "time"

type RecordingStatus string

const (
	RecordingStatusPending      RecordingStatus = "pending"
	RecordingStatusUploaded     RecordingStatus = "uploaded"
	RecordingStatusTranscribing RecordingStatus = "transcribing"
	RecordingStatusTranscribed  RecordingStatus = "transcribed"
	RecordingStatusFailed       RecordingStatus = "failed"
)

type JobStatus string

const (
	JobStatusUnknown    JobStatus = "unknown"
	JobStatusCreated    JobStatus = "created"
	JobStatusProcessing JobStatus = "processing"
	JobStatusCompleted  JobStatus = "completed"
	JobStatusFailed     JobStatus = "failed"
	JobStatusError      JobStatus = "error"
)

type Recording struct {
	ID            string
	Title         *string
	Status        RecordingStatus
	FileName      string
	FileSizeBytes int
	ContentType   *string
	S3Key         *string
	CreatedAt     time.Time
	UpdatedAt     *time.Time
}

type TranscriptionJob struct {
	ID            string
	RecordingID   string
	RawText       *string
	Status        JobStatus
	CreatedAt     time.Time
	UpdatedAt     *time.Time
	RetryCount    int
	FailureReason *string
}
