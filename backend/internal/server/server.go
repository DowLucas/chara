package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"

	"github.com/DowLucas/quits/internal/auth"
	"github.com/DowLucas/quits/internal/config"
	"github.com/DowLucas/quits/internal/db"
	"github.com/DowLucas/quits/internal/handler"
	"github.com/DowLucas/quits/internal/middleware"
	"github.com/DowLucas/quits/internal/wellknown"
	"github.com/jackc/pgx/v5/pgxpool"
)

const version = "0.1.0"

func New(cfg *config.Config, pool *pgxpool.Pool, queries *db.Queries, jwtSvc *auth.JWTService) http.Handler {
	r := chi.NewRouter()

	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Compress(5))

	healthH := handler.NewHealthHandler(pool)

	r.Get("/.well-known/quits-instance", wellknown.Handler(cfg, version))
	r.Get("/api/health/liveness", healthH.Liveness)
	r.Get("/api/health/readiness", healthH.Readiness)

	groupH := handler.NewGroupHandler(pool, queries, cfg)

	// Authenticated routes
	r.Group(func(r chi.Router) {
		r.Use(middleware.Authenticate(jwtSvc))

		r.Post("/api/groups", groupH.Create)
		r.Get("/api/groups", groupH.List)
		r.Get("/api/groups/{groupID}", groupH.Get)
		r.Patch("/api/groups/{groupID}", groupH.Update)
		r.Delete("/api/groups/{groupID}", groupH.Archive)
		r.Get("/api/groups/{groupID}/invite-link", groupH.GetInviteLink)
		r.Post("/api/groups/join/{token}", groupH.JoinViaToken)
	})

	// Hosted-only routes (Google, Apple auth)
	r.Group(func(r chi.Router) {
		r.Use(middleware.HostedOnly(cfg))
		// Social auth handlers added here
	})

	return r
}
