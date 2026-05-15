package db

import (
	"context"
	"database/sql"
)

func (s *Store) GetRecordingByID(ctx context.Context, id string) (*Recording, error) {
	var r Recording
	err := s.DB.QueryRowContext(ctx, `
		SELECT id, title, status, file_name, file_size_bytes, content_type, s3_key, created_at, updated_at
		FROM recordings WHERE id = ?
	`, id).Scan(
		&r.ID,
		&r.Title,
		&r.Status,
		&r.FileName,
		&r.FileSizeBytes,
		&r.ContentType,
		&r.S3Key,
		&r.CreatedAt,
		&r.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func (s *Store) UpdateRecordingStatus(ctx context.Context, id string, status RecordingStatus) error {
	_, err := s.DB.ExecContext(ctx, `
		UPDATE recordings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
	`, status, id)
	return err
}
