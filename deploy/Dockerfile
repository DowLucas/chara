FROM golang:1.23-alpine AS builder
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/api ./cmd/api

FROM scratch
COPY --from=builder /bin/api /api
COPY --from=builder /src/migrations /migrations
EXPOSE 8080
ENTRYPOINT ["/api"]
