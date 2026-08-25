package db

import (
	"context"
	"database/sql"
	"fmt"
)

func (s *Store) GetRecordingByID(ctx context.Context, id string) (*Recording, error) {
	var r Recording
	var createdAt string
	var updatedAt sql.NullString

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
		&createdAt,
		&updatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	r.CreatedAt, err = parseSQLiteTime(createdAt)
	if err != nil {
		return nil, fmt.Errorf("parse recording created_at: %w", err)
	}

	r.UpdatedAt, err = parseNullableSQLiteTime(updatedAt)
	if err != nil {
		return nil, fmt.Errorf("parse recording updated_at: %w", err)
	}

	return &r, nil
}

func (s *Store) UpdateRecordingStatus(ctx context.Context, id string, status RecordingStatus) error {
	_, err := s.DB.ExecContext(ctx, `
		UPDATE recordings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
	`, status, id)
	return err
}
