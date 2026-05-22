// Package storage wraps an S3-compatible object store (MinIO in dev,
// AWS/CF/etc. in production). It's the only place that talks to the bucket
// — handlers receive a *Client and don't import minio-go directly.
package storage

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// Client is the application-facing handle to object storage. Construct one
// at process start with New(); it's safe for concurrent use.
type Client struct {
	bucket string
	mc     *minio.Client
}

// Config carries the S3-compatible parameters. Endpoint is the host[:port]
// of the bucket service (no scheme); UseSSL toggles https.
type Config struct {
	Endpoint  string
	Bucket    string
	AccessKey string
	SecretKey string
	Region    string
	UseSSL    bool
}

// New initialises the client and ensures the bucket exists. Idempotent —
// calling against an already-provisioned bucket is a no-op.
func New(ctx context.Context, cfg Config) (*Client, error) {
	if cfg.Endpoint == "" {
		return nil, errors.New("storage: endpoint is required")
	}
	if cfg.Bucket == "" {
		return nil, errors.New("storage: bucket is required")
	}

	// minio-go expects host[:port] without scheme; we accept a URL form in
	// config so the rest of the codebase can use a single S3_ENDPOINT
	// variable that mirrors how AWS SDKs document it.
	endpoint := cfg.Endpoint
	useSSL := cfg.UseSSL
	if strings.HasPrefix(endpoint, "https://") {
		endpoint = strings.TrimPrefix(endpoint, "https://")
		useSSL = true
	} else if strings.HasPrefix(endpoint, "http://") {
		endpoint = strings.TrimPrefix(endpoint, "http://")
		useSSL = false
	}

	mc, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: useSSL,
		Region: cfg.Region,
	})
	if err != nil {
		return nil, fmt.Errorf("storage: minio.New: %w", err)
	}

	exists, err := mc.BucketExists(ctx, cfg.Bucket)
	if err != nil {
		return nil, fmt.Errorf("storage: BucketExists: %w", err)
	}
	if !exists {
		if err := mc.MakeBucket(ctx, cfg.Bucket, minio.MakeBucketOptions{Region: cfg.Region}); err != nil {
			return nil, fmt.Errorf("storage: MakeBucket: %w", err)
		}
	}

	return &Client{bucket: cfg.Bucket, mc: mc}, nil
}

// Bucket exposes the configured bucket name so handlers can include it in
// audit logs without smuggling config around.
func (c *Client) Bucket() string { return c.bucket }

// Upload writes the byte payload at the given key with the given content
// type. Existing objects with the same key are overwritten — caller is
// responsible for generating unique keys (expense attachments use ULIDs).
func (c *Client) Upload(ctx context.Context, key string, data []byte, contentType string) error {
	_, err := c.mc.PutObject(ctx, c.bucket, key, bytes.NewReader(data), int64(len(data)),
		minio.PutObjectOptions{ContentType: contentType})
	if err != nil {
		return fmt.Errorf("storage: PutObject: %w", err)
	}
	return nil
}

// PresignedGet returns a short-lived HTTP URL the client can use to fetch
// the object directly from the bucket, skipping a proxy round-trip
// through the API. ttl is clamped to the [1m, 7d] minio-go range.
func (c *Client) PresignedGet(ctx context.Context, key string, ttl time.Duration) (string, error) {
	if ttl < time.Minute {
		ttl = time.Minute
	}
	if ttl > 7*24*time.Hour {
		ttl = 7 * 24 * time.Hour
	}
	u, err := c.mc.PresignedGetObject(ctx, c.bucket, key, ttl, url.Values{})
	if err != nil {
		return "", fmt.Errorf("storage: PresignedGetObject: %w", err)
	}
	return u.String(), nil
}

// Delete removes an object. Used when an expense is deleted to keep the
// bucket from accumulating orphans.
func (c *Client) Delete(ctx context.Context, key string) error {
	if err := c.mc.RemoveObject(ctx, c.bucket, key, minio.RemoveObjectOptions{}); err != nil {
		return fmt.Errorf("storage: RemoveObject: %w", err)
	}
	return nil
}

// Object is a streaming handle to an object's bytes. Closes the underlying
// reader on Close(). Used by the attachments proxy so phones / emulators
// can fetch receipts without needing direct network access to the bucket.
type Object struct {
	Body        *minio.Object
	ContentType string
	Size        int64
}

func (o *Object) Read(p []byte) (int, error) { return o.Body.Read(p) }
func (o *Object) Close() error               { return o.Body.Close() }

// Open returns a streaming handle to the named object. Caller MUST Close()
// the returned Object even on error paths.
func (c *Client) Open(ctx context.Context, key string) (*Object, error) {
	obj, err := c.mc.GetObject(ctx, c.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("storage: GetObject: %w", err)
	}
	info, err := obj.Stat()
	if err != nil {
		obj.Close()
		return nil, fmt.Errorf("storage: Stat: %w", err)
	}
	return &Object{Body: obj, ContentType: info.ContentType, Size: info.Size}, nil
}
