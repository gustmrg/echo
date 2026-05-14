package db

import (
	"context"
	"database/sql"
)

func (s *Store) GetNextPendingJob(ctx context.Context) (*TranscriptionJob, error) {
	var j TranscriptionJob
	err := s.DB.QueryRowContext(ctx, `
		UPDATE transcription_jobs
		SET status = 'processing', updated_at = CURRENT_TIMESTAMP
		WHERE id = (
			SELECT id FROM transcription_jobs
			WHERE status = 'created'
			ORDER BY created_at ASC
			LIMIT 1
		)
		RETURNING id, recording_id, raw_text, status, created_at, updated_at, retry_count, failure_reason
	`).Scan(&j.ID, &j.RecordingID, &j.RawText, &j.Status,
		&j.CreatedAt, &j.UpdatedAt, &j.RetryCount, &j.FailureReason)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &j, nil
}

func (s *Store) MarkJobCompleted(ctx context.Context, id string, rawText string) error {
	_, err := s.DB.ExecContext(ctx, `
		UPDATE transcription_jobs
		SET status = 'completed', raw_text = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, rawText, id)
	return err
}

func (s *Store) MarkJobFailed(ctx context.Context, id string, reason string) error {
	_, err := s.DB.ExecContext(ctx, `
		UPDATE transcription_jobs
		SET status = 'failed', failure_reason = ?, retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, reason, id)
	return err
}
