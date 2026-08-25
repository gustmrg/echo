package storage

import (
	"context"
	"fmt"
	"io"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type FileStorage interface {
	Download(ctx context.Context, key string) ([]byte, error)
}

type S3Storage struct {
	client *s3.Client
	bucket string
}

type S3Config struct {
	Bucket         string
	Region         string
	Endpoint       string
	AccessKey      string
	SecretKey      string
	ForcePathStyle bool
}

func NewS3Storage(ctx context.Context, storageConfig S3Config) (*S3Storage, error) {
	if storageConfig.Bucket == "" {
		return nil, fmt.Errorf("s3 bucket is required")
	}
	if storageConfig.Region == "" {
		storageConfig.Region = "us-east-1"
	}
	if (storageConfig.AccessKey == "") != (storageConfig.SecretKey == "") {
		return nil, fmt.Errorf("s3 access key and secret key must both be set")
	}

	loadOptions := []func(*awsconfig.LoadOptions) error{
		awsconfig.WithRegion(storageConfig.Region),
	}
	if storageConfig.AccessKey != "" {
		loadOptions = append(loadOptions, awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(storageConfig.AccessKey, storageConfig.SecretKey, ""),
		))
	}

	awsConfig, err := awsconfig.LoadDefaultConfig(ctx, loadOptions...)
	if err != nil {
		return nil, fmt.Errorf("load aws config: %w", err)
	}

	client := s3.NewFromConfig(awsConfig, func(options *s3.Options) {
		if storageConfig.Endpoint != "" {
			options.BaseEndpoint = aws.String(storageConfig.Endpoint)
		}
		options.UsePathStyle = storageConfig.ForcePathStyle || storageConfig.Endpoint != ""
	})

	return &S3Storage{
		client: client,
		bucket: storageConfig.Bucket,
	}, nil
}

func (s *S3Storage) Download(ctx context.Context, key string) ([]byte, error) {
	if key == "" {
		return nil, fmt.Errorf("s3 object key is required")
	}

	output, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, fmt.Errorf("get s3 object %q: %w", key, err)
	}
	defer output.Body.Close()

	contents, err := io.ReadAll(output.Body)
	if err != nil {
		return nil, fmt.Errorf("read s3 object %q: %w", key, err)
	}

	return contents, nil
}
