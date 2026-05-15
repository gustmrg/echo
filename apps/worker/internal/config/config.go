package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	DBPath  string
	Storage StorageConfig
}

type StorageConfig struct {
	Bucket         string
	Region         string
	Endpoint       string
	AccessKey      string
	SecretKey      string
	ForcePathStyle bool
}

func Load() (*Config, error) {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		return nil, fmt.Errorf("DB_PATH environment variable is required")
	}

	storageConfig, err := loadStorageConfig()
	if err != nil {
		return nil, err
	}

	return &Config{
		DBPath:  dbPath,
		Storage: storageConfig,
	}, nil
}

func loadStorageConfig() (StorageConfig, error) {
	endpoint := envFirst("S3_ENDPOINT", "STORAGE_ENDPOINT", "Storage__Endpoint")
	forcePathStyle := endpoint != ""

	if value := envFirst("S3_FORCE_PATH_STYLE", "STORAGE_FORCE_PATH_STYLE", "Storage__ForcePathStyle"); value != "" {
		parsed, err := strconv.ParseBool(value)
		if err != nil {
			return StorageConfig{}, fmt.Errorf("parse S3_FORCE_PATH_STYLE: %w", err)
		}
		forcePathStyle = parsed
	}

	region := envFirst("S3_REGION", "AWS_REGION", "AWS_DEFAULT_REGION", "Storage__Region")
	if region == "" {
		region = "us-east-1"
	}

	return StorageConfig{
		Bucket:         envFirst("S3_BUCKET", "STORAGE_BUCKET", "Storage__BucketName"),
		Region:         region,
		Endpoint:       endpoint,
		AccessKey:      envFirst("S3_ACCESS_KEY", "AWS_ACCESS_KEY_ID", "Storage__AccessKey"),
		SecretKey:      envFirst("S3_SECRET_KEY", "AWS_SECRET_ACCESS_KEY", "Storage__SecretKey"),
		ForcePathStyle: forcePathStyle,
	}, nil
}

func envFirst(names ...string) string {
	for _, name := range names {
		if value := os.Getenv(name); value != "" {
			return value
		}
	}
	return ""
}
