# Multi-stage build
FROM golang:1.25-alpine AS builder

WORKDIR /build

# Install build dependencies
RUN apk add --no-cache git ca-certificates tzdata

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build binary with stripping and trimpath
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w" \
    -trimpath \
    -o api ./cmd/api

# Runtime stage
FROM alpine:3.20

WORKDIR /app

# Install runtime dependencies (CA certificates for HTTPS)
RUN apk add --no-cache ca-certificates tzdata

# Copy CA certs from builder
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

# Copy binary and migrations from builder, owned by the non-root user
RUN adduser -D -u 10001 chara
COPY --from=builder --chown=chara:chara /build/api .
COPY --chown=chara:chara migrations ./migrations

USER chara

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q -O- http://localhost:8080/api/health/liveness || exit 1

EXPOSE 8080

ENTRYPOINT ["./api"]
