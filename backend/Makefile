SQLC = $(shell which sqlc 2>/dev/null || echo $$HOME/.local/bin/sqlc)
MIGRATE = $(shell which migrate 2>/dev/null || echo $$HOME/go/bin/migrate)

.PHONY: generate migrate-up migrate-down migrate-create test test-unit test-integration lint build

generate:
	cd sqlc && $(SQLC) generate

migrate-up:
	$(MIGRATE) -path migrations -database "$(DATABASE_URL)" up

migrate-down:
	$(MIGRATE) -path migrations -database "$(DATABASE_URL)" down 1

migrate-create:
	$(MIGRATE) create -ext sql -dir migrations -seq $(name)

test:
	go test ./... -race -count=1

test-unit:
	go test ./... -run $(or $(RUN),.) -race -count=1 -short

test-integration:
	go test ./... -run $(or $(RUN),.) -race -count=1 -tags integration

lint:
	golangci-lint run ./...

build:
	go build -o bin/api ./cmd/api

.DEFAULT_GOAL := build
