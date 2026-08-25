package transcription

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gustmrg/echo/apps/worker/internal/config"
	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
)

type Transcriber interface {
	TranscribeAudio(ctx context.Context, r io.Reader, filename, contentType string) (string, error)
}

type audioFile struct {
	io.Reader
	filename    string
	contentType string
}

func (f audioFile) Filename() string {
	return f.filename
}

func (f audioFile) ContentType() string {
	return f.contentType
}

type OpenAITranscriber struct {
	client *openai.Client
}

func NewOpenAITranscriber(cfg config.OpenAIConfig) *OpenAITranscriber {
	client := openai.NewClient(
		option.WithAPIKey(cfg.APIKey),
	)

	return &OpenAITranscriber{client: &client}
}

func (t *OpenAITranscriber) TranscribeAudio(ctx context.Context, r io.Reader, filename, contentType string) (string, error) {
	if contentType == "" {
		contentType = mime.TypeByExtension(filepath.Ext(filename))
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	resp, err := t.client.Audio.Transcriptions.New(ctx, openai.AudioTranscriptionNewParams{
		File: audioFile{
			Reader:      r,
			filename:    filename,
			contentType: contentType,
		},
		Model:          openai.AudioModelGPT4oTranscribe,
		ResponseFormat: openai.AudioResponseFormatJSON,
	})
	if err != nil {
		return "", fmt.Errorf("openai transcription failed: %w", err)
	}

	return resp.Text, nil
}

type OpenRouterTranscriber struct {
	apiKey     string
	baseURL    string
	model      string
	httpClient *http.Client
}

func NewOpenRouterTranscriber(cfg config.OpenRouterConfig, httpClient *http.Client) *OpenRouterTranscriber {
	if httpClient == nil {
		httpClient = http.DefaultClient
	}

	return &OpenRouterTranscriber{
		apiKey:     cfg.APIKey,
		baseURL:    strings.TrimRight(cfg.BaseURL, "/"),
		model:      cfg.Model,
		httpClient: httpClient,
	}
}

type openRouterTranscriptionRequest struct {
	InputAudio openRouterInputAudio `json:"input_audio"`
	Model      string               `json:"model"`
}

type openRouterInputAudio struct {
	Data   string `json:"data"`
	Format string `json:"format"`
}

type openRouterTranscriptionResponse struct {
	Text string `json:"text"`
}

func (t *OpenRouterTranscriber) TranscribeAudio(ctx context.Context, r io.Reader, filename, contentType string) (string, error) {
	format, err := inferOpenRouterAudioFormat(filename)
	if err != nil {
		return "", err
	}

	audio, err := io.ReadAll(r)
	if err != nil {
		return "", fmt.Errorf("read audio for openrouter transcription: %w", err)
	}

	payload := openRouterTranscriptionRequest{
		InputAudio: openRouterInputAudio{
			Data:   base64.StdEncoding.EncodeToString(audio),
			Format: format,
		},
		Model: t.model,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("encode openrouter transcription request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, t.baseURL+"/audio/transcriptions", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("create openrouter transcription request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+t.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := t.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("openrouter transcription failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", fmt.Errorf("openrouter transcription failed with status %d: %s", resp.StatusCode, strings.TrimSpace(string(responseBody)))
	}

	var parsed openRouterTranscriptionResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return "", fmt.Errorf("decode openrouter transcription response: %w", err)
	}
	if parsed.Text == "" {
		return "", fmt.Errorf("openrouter transcription response did not include text")
	}

	return parsed.Text, nil
}

func NewTranscriber(cfg config.TranscriptionConfig) (Transcriber, error) {
	switch cfg.Provider {
	case config.TranscriptionProviderOpenRouter:
		return NewOpenRouterTranscriber(cfg.OpenRouter, nil), nil
	case config.TranscriptionProviderOpenAI:
		return NewOpenAITranscriber(cfg.OpenAI), nil
	default:
		return nil, fmt.Errorf("unsupported transcription provider %q", cfg.Provider)
	}
}

func inferOpenRouterAudioFormat(filename string) (string, error) {
	format := strings.TrimPrefix(strings.ToLower(filepath.Ext(filename)), ".")
	switch format {
	case "flac", "m4a", "mp3", "mp4", "mpeg", "mpga", "oga", "ogg", "wav", "webm":
		return format, nil
	default:
		return "", fmt.Errorf("could not infer supported openrouter audio format from filename %q", filename)
	}
}
