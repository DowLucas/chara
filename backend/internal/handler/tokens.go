package handler

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/DowLucas/chara/internal/auth"
	"github.com/DowLucas/chara/internal/config"
	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/ulid"
)

const (
	// defaultRefreshTTL is the fallback refresh-token lifetime when the config
	// leaves it unset (e.g. in tests). Production reads REFRESH_TOKEN_TTL.
	defaultRefreshTTL = 365 * 24 * time.Hour
	// maxUserAgentLen caps the stored user_agent so a hostile client can't
	// bloat the row.
	maxUserAgentLen = 256
)

// issueRefreshToken mints a refresh-token row and returns the raw token. Only
// the SHA-256 hash is persisted; the raw value is shown to the client once.
func issueRefreshToken(ctx context.Context, q *db.Queries, cfg *config.Config, userID, userAgent string) (string, error) {
	raw, err := auth.GenerateToken()
	if err != nil {
		return "", err
	}
	ttl := cfg.RefreshTokenTTL
	if ttl == 0 {
		ttl = defaultRefreshTTL
	}
	if len(userAgent) > maxUserAgentLen {
		userAgent = userAgent[:maxUserAgentLen]
	}
	if _, err := q.CreateRefreshToken(ctx, db.CreateRefreshTokenParams{
		ID:        ulid.New(),
		UserID:    userID,
		TokenHash: auth.HashToken(raw),
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(ttl), Valid: true},
		UserAgent: userAgent,
	}); err != nil {
		return "", err
	}
	return raw, nil
}

// writeTokenPair signs a fresh access JWT, issues a refresh token, and writes
// the standard token response. Shared by every sign-in flow (magic link,
// Apple, Google) and by the refresh-rotation endpoint.
func writeTokenPair(w http.ResponseWriter, r *http.Request, q *db.Queries, jwtSvc *auth.JWTService, cfg *config.Config, user db.User) {
	jwtStr, err := jwtSvc.Sign(user.ID, user.Email, cfg.InstanceMode)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to sign token")
		return
	}
	refresh, err := issueRefreshToken(r.Context(), q, cfg, user.ID, r.UserAgent())
	if err != nil {
		slog.Error("auth: failed to issue refresh token", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to issue refresh token")
		return
	}
	writeJSON(w, http.StatusOK, tokenResponse{Token: jwtStr, RefreshToken: refresh, User: userToResponse(user)})
}
