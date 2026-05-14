package db

import "context"

func (s *Store) UpdateRecordingStatus(ctx context.Context, id string, status RecordingStatus) error {
	_, err := s.DB.ExecContext(ctx, `
		UPDATE recordings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
	`, status, id)
	return err
}
