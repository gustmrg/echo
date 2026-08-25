package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	DBPath        string
	Storage       StorageConfig
	Transcription TranscriptionConfig
}

type StorageConfig struct {
	Bucket         string
	Region         string
	Endpoint       string
	AccessKey      string
	SecretKey      string
	ForcePathStyle bool
}

type TranscriptionProvider string

const (
	TranscriptionProviderOpenRouter TranscriptionProvider = "openrouter"
	TranscriptionProviderOpenAI     TranscriptionProvider = "openai"
)

type TranscriptionConfig struct {
	Provider   TranscriptionProvider
	OpenRouter OpenRouterConfig
	OpenAI     OpenAIConfig
}

type OpenRouterConfig struct {
	APIKey  string
	BaseURL string
	Model   string
}

type OpenAIConfig struct {
	APIKey string
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

	transcriptionConfig, err := loadTranscriptionConfig()
	if err != nil {
		return nil, err
	}

	return &Config{
		DBPath:        dbPath,
		Storage:       storageConfig,
		Transcription: transcriptionConfig,
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

func loadTranscriptionConfig() (TranscriptionConfig, error) {
	provider := TranscriptionProvider(envFirst("TRANSCRIPTION_PROVIDER", "Transcription__Provider"))
	if provider == "" {
		provider = TranscriptionProviderOpenRouter
	}

	openRouterBaseURL := envFirst("OPENROUTER_BASE_URL", "Transcription__OpenRouter__BaseUrl")
	if openRouterBaseURL == "" {
		openRouterBaseURL = "https://openrouter.ai/api/v1"
	}

	openRouterModel := envFirst("OPENROUTER_TRANSCRIPTION_MODEL", "Transcription__OpenRouter__Model")
	if openRouterModel == "" {
		openRouterModel = "openai/gpt-4o-mini-transcribe"
	}

	cfg := TranscriptionConfig{
		Provider: provider,
		OpenRouter: OpenRouterConfig{
			APIKey:  envFirst("OPENROUTER_API_KEY", "Transcription__OpenRouter__ApiKey"),
			BaseURL: openRouterBaseURL,
			Model:   openRouterModel,
		},
		OpenAI: OpenAIConfig{
			APIKey: envFirst("OPENAI_API_KEY", "Transcription__OpenAI__ApiKey"),
		},
	}

	switch provider {
	case TranscriptionProviderOpenRouter:
		if cfg.OpenRouter.APIKey == "" {
			return TranscriptionConfig{}, fmt.Errorf("OPENROUTER_API_KEY is required when TRANSCRIPTION_PROVIDER=openrouter")
		}
	case TranscriptionProviderOpenAI:
		if cfg.OpenAI.APIKey == "" {
			return TranscriptionConfig{}, fmt.Errorf("OPENAI_API_KEY is required when TRANSCRIPTION_PROVIDER=openai")
		}
	default:
		return TranscriptionConfig{}, fmt.Errorf("TRANSCRIPTION_PROVIDER must be one of: openrouter, openai")
	}

	return cfg, nil
}
