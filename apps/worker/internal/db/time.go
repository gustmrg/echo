package db

import (
	"database/sql"
	"fmt"
	"time"
)

var sqliteTimeLayouts = []string{
	"2006-01-02 15:04:05.999999999-07:00",
	"2006-01-02 15:04:05.999999999Z07:00",
	"2006-01-02 15:04:05.999999999",
	"2006-01-02 15:04:05-07:00",
	"2006-01-02 15:04:05Z07:00",
	"2006-01-02 15:04:05",
	time.RFC3339Nano,
	time.RFC3339,
}

func parseSQLiteTime(value string) (time.Time, error) {
	for _, layout := range sqliteTimeLayouts {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed.UTC(), nil
		}
	}

	return time.Time{}, fmt.Errorf("parse sqlite time %q", value)
}

func parseNullableSQLiteTime(value sql.NullString) (*time.Time, error) {
	if !value.Valid {
		return nil, nil
	}

	parsed, err := parseSQLiteTime(value.String)
	if err != nil {
		return nil, err
	}

	return &parsed, nil
}
