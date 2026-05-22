//go:build integration

package testutil

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/DowLucas/chara/internal/storage"
)

var (
	storageOnce   sync.Once
	sharedStorage *storage.Client
	storageErr    error
)

// SharedStorage returns a *storage.Client backed by a MinIO testcontainer.
// The bucket is shared across tests within a process; use distinct keys per
// test to avoid interference (handlers already generate ULIDs).
func SharedStorage(t *testing.T) *storage.Client {
	t.Helper()
	storageOnce.Do(func() {
		sharedStorage, storageErr = startTestStorage()
	})
	if storageErr != nil {
		t.Fatalf("test storage setup: %v", storageErr)
	}
	return sharedStorage
}

func startTestStorage() (*storage.Client, error) {
	ctx := context.Background()

	req := testcontainers.ContainerRequest{
		Image:        "minio/minio:latest",
		ExposedPorts: []string{"9000/tcp"},
		Env: map[string]string{
			"MINIO_ROOT_USER":     "minioadmin",
			"MINIO_ROOT_PASSWORD": "minioadmin",
		},
		Cmd: []string{"server", "/data"},
		WaitingFor: wait.ForHTTP("/minio/health/live").
			WithPort("9000/tcp").
			WithStartupTimeout(60 * time.Second),
	}
	container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: req,
		Started:          true,
	})
	if err != nil {
		return nil, fmt.Errorf("start minio container: %w", err)
	}
	host, err := container.Host(ctx)
	if err != nil {
		return nil, err
	}
	port, err := container.MappedPort(ctx, "9000/tcp")
	if err != nil {
		return nil, err
	}

	endpoint := fmt.Sprintf("%s:%s", host, port.Port())
	client, err := storage.New(ctx, storage.Config{
		Endpoint:  endpoint,
		Bucket:    "chara-test",
		AccessKey: "minioadmin",
		SecretKey: "minioadmin",
		Region:    "us-east-1",
		UseSSL:    false,
	})
	if err != nil {
		return nil, fmt.Errorf("storage.New: %w", err)
	}
	return client, nil
}
