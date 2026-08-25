package transcription

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gustmrg/echo/apps/worker/internal/config"
)

func TestOpenRouterTranscriberSendsConfiguredModelAndAudio(t *testing.T) {
	var gotAuth string
	var gotContentType string
	var gotRequest openRouterTranscriptionRequest

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/audio/transcriptions" {
			t.Fatalf("path = %q", r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		gotContentType = r.Header.Get("Content-Type")

		if err := json.NewDecoder(r.Body).Decode(&gotRequest); err != nil {
			t.Fatalf("decode request: %v", err)
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"text":"hello world"}`))
	}))
	defer server.Close()

	transcriber := NewOpenRouterTranscriber(config.OpenRouterConfig{
		APIKey:  "openrouter-key",
		BaseURL: server.URL,
		Model:   "openai/whisper-1",
	}, server.Client())

	text, err := transcriber.TranscribeAudio(context.Background(), strings.NewReader("audio bytes"), "recording.mp3", "audio/mpeg")
	if err != nil {
		t.Fatalf("TranscribeAudio() error = %v", err)
	}

	if text != "hello world" {
		t.Fatalf("text = %q", text)
	}
	if gotAuth != "Bearer openrouter-key" {
		t.Fatalf("authorization = %q", gotAuth)
	}
	if gotContentType != "application/json" {
		t.Fatalf("content type = %q", gotContentType)
	}
	if gotRequest.Model != "openai/whisper-1" {
		t.Fatalf("model = %q", gotRequest.Model)
	}
	if gotRequest.InputAudio.Format != "mp3" {
		t.Fatalf("format = %q", gotRequest.InputAudio.Format)
	}

	decoded, err := base64.StdEncoding.DecodeString(gotRequest.InputAudio.Data)
	if err != nil {
		t.Fatalf("audio data is not base64: %v", err)
	}
	if string(decoded) != "audio bytes" {
		t.Fatalf("decoded audio = %q", string(decoded))
	}
}

func TestOpenRouterTranscriberReturnsProviderErrorForNonSuccess(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "rate limited", http.StatusTooManyRequests)
	}))
	defer server.Close()

	transcriber := NewOpenRouterTranscriber(config.OpenRouterConfig{
		APIKey:  "openrouter-key",
		BaseURL: server.URL,
		Model:   "openai/gpt-4o-mini-transcribe",
	}, server.Client())

	_, err := transcriber.TranscribeAudio(context.Background(), strings.NewReader("audio bytes"), "recording.wav", "audio/wav")
	if err == nil {
		t.Fatal("TranscribeAudio() error = nil, want non-2xx error")
	}
	if !strings.Contains(err.Error(), "openrouter transcription failed with status 429") {
		t.Fatalf("error = %q", err.Error())
	}
}

func TestOpenRouterTranscriberRejectsUnsupportedFilename(t *testing.T) {
	transcriber := NewOpenRouterTranscriber(config.OpenRouterConfig{
		APIKey:  "openrouter-key",
		BaseURL: "https://example.test",
		Model:   "openai/gpt-4o-mini-transcribe",
	}, nil)

	_, err := transcriber.TranscribeAudio(context.Background(), strings.NewReader("audio bytes"), "recording", "audio/wav")
	if err == nil {
		t.Fatal("TranscribeAudio() error = nil, want unsupported format error")
	}
	if !strings.Contains(err.Error(), "could not infer supported openrouter audio format") {
		t.Fatalf("error = %q", err.Error())
	}
}
