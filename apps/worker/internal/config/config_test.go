package config

import "testing"

func setBaseEnv(t *testing.T) {
	t.Helper()

	t.Setenv("DB_PATH", "/tmp/echo.db")
	t.Setenv("TRANSCRIPTION_PROVIDER", "")
	t.Setenv("OPENROUTER_API_KEY", "")
	t.Setenv("OPENROUTER_BASE_URL", "")
	t.Setenv("OPENROUTER_TRANSCRIPTION_MODEL", "")
	t.Setenv("OPENAI_API_KEY", "")
}

func TestLoadDefaultsToOpenRouterTranscription(t *testing.T) {
	setBaseEnv(t)
	t.Setenv("OPENROUTER_API_KEY", "openrouter-key")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.Transcription.Provider != TranscriptionProviderOpenRouter {
		t.Fatalf("provider = %q, want %q", cfg.Transcription.Provider, TranscriptionProviderOpenRouter)
	}
	if cfg.Transcription.OpenRouter.Model != "openai/gpt-4o-mini-transcribe" {
		t.Fatalf("model = %q", cfg.Transcription.OpenRouter.Model)
	}
	if cfg.Transcription.OpenRouter.BaseURL != "https://openrouter.ai/api/v1" {
		t.Fatalf("base url = %q", cfg.Transcription.OpenRouter.BaseURL)
	}
}

func TestLoadUsesCustomOpenRouterModel(t *testing.T) {
	setBaseEnv(t)
	t.Setenv("OPENROUTER_API_KEY", "openrouter-key")
	t.Setenv("OPENROUTER_TRANSCRIPTION_MODEL", "openai/whisper-1")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.Transcription.OpenRouter.Model != "openai/whisper-1" {
		t.Fatalf("model = %q", cfg.Transcription.OpenRouter.Model)
	}
}

func TestLoadRequiresOpenRouterAPIKeyForOpenRouterProvider(t *testing.T) {
	setBaseEnv(t)
	t.Setenv("TRANSCRIPTION_PROVIDER", "openrouter")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want missing OPENROUTER_API_KEY error")
	}
}

func TestLoadRequiresOpenAIAPIKeyForOpenAIProvider(t *testing.T) {
	setBaseEnv(t)
	t.Setenv("TRANSCRIPTION_PROVIDER", "openai")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want missing OPENAI_API_KEY error")
	}
}

func TestLoadAcceptsOpenAIProvider(t *testing.T) {
	setBaseEnv(t)
	t.Setenv("TRANSCRIPTION_PROVIDER", "openai")
	t.Setenv("OPENAI_API_KEY", "openai-key")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.Transcription.Provider != TranscriptionProviderOpenAI {
		t.Fatalf("provider = %q, want %q", cfg.Transcription.Provider, TranscriptionProviderOpenAI)
	}
}

func TestLoadRejectsInvalidTranscriptionProvider(t *testing.T) {
	setBaseEnv(t)
	t.Setenv("TRANSCRIPTION_PROVIDER", "other")

	if _, err := Load(); err == nil {
		t.Fatal("Load() error = nil, want invalid provider error")
	}
}
