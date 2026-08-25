package db

import (
	"database/sql"
	"testing"
	"time"
)

func TestParseSQLiteTimeAcceptsEFCoreOffsetFormat(t *testing.T) {
	parsed, err := parseSQLiteTime("2026-05-17 14:39:35.870361+00:00")
	if err != nil {
		t.Fatalf("parseSQLiteTime() error = %v", err)
	}

	if parsed.Location() != time.UTC {
		t.Fatalf("location = %v, want UTC", parsed.Location())
	}
	if parsed.Format(time.RFC3339Nano) != "2026-05-17T14:39:35.870361Z" {
		t.Fatalf("parsed = %s", parsed.Format(time.RFC3339Nano))
	}
}

func TestParseSQLiteTimeAcceptsCurrentTimestampFormat(t *testing.T) {
	parsed, err := parseSQLiteTime("2026-05-17 14:39:35")
	if err != nil {
		t.Fatalf("parseSQLiteTime() error = %v", err)
	}

	if parsed.Format(time.RFC3339) != "2026-05-17T14:39:35Z" {
		t.Fatalf("parsed = %s", parsed.Format(time.RFC3339))
	}
}

func TestParseNullableSQLiteTimeReturnsNilForNull(t *testing.T) {
	parsed, err := parseNullableSQLiteTime(sql.NullString{})
	if err != nil {
		t.Fatalf("parseNullableSQLiteTime() error = %v", err)
	}
	if parsed != nil {
		t.Fatalf("parsed = %v, want nil", parsed)
	}
}
