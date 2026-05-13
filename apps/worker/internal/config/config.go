package config

import (
	"fmt"
	"os"
)

type Config struct {
	DBPath string
}

func Load() (*Config, error) {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		return nil, fmt.Errorf("DB_PATH environment variable is required")
	}

	return &Config{DBPath: dbPath}, nil
}