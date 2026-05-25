FROM golang:1.26-alpine AS builder
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/api ./cmd/api
RUN echo 'chara:x:10001:10001::/:/sbin/nologin' > /tmp/passwd

FROM scratch
COPY --from=builder /tmp/passwd /etc/passwd
COPY --from=builder /bin/api /api
COPY --from=builder /src/migrations /migrations
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["/api"]
