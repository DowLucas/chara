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
	r.Use(corsMiddleware)
	r.Use(chimiddleware.Compress(5))

	healthH := handler.NewHealthHandler(pool)
	authH := handler.NewAuthHandler(pool, queries, cfg, jwtSvc)

	r.Get("/.well-known/quits-instance", wellknown.Handler(cfg, version))
	r.Get("/api/health/liveness", healthH.Liveness)
	r.Get("/api/health/readiness", healthH.Readiness)

	r.Post("/api/auth/magic-link", authH.MagicLink)
	r.Post("/api/auth/verify", authH.Verify)

	groupH := handler.NewGroupHandler(pool, queries, cfg)
	expenseH := handler.NewExpenseHandler(pool, queries)
	balancesH := handler.NewBalancesHandler(pool, queries)
	activityH := handler.NewActivityHandler(pool, queries)

	// Authenticated routes
	r.Group(func(r chi.Router) {
		r.Use(middleware.Authenticate(jwtSvc))

		r.Get("/api/me", authH.Me)
		r.Patch("/api/me", authH.UpdateMe)

		r.Post("/api/groups", groupH.Create)
		r.Get("/api/groups", groupH.List)
		r.Get("/api/groups/{groupID}", groupH.Get)
		r.Patch("/api/groups/{groupID}", groupH.Update)
		r.Delete("/api/groups/{groupID}", groupH.Archive)
		r.Get("/api/groups/{groupID}/invite-link", groupH.GetInviteLink)
		r.Post("/api/groups/join/{token}", groupH.JoinViaToken)

		r.Post("/api/groups/{groupID}/expenses", expenseH.Create)
		r.Get("/api/groups/{groupID}/expenses", expenseH.List)
		r.Get("/api/groups/{groupID}/expenses/{expenseID}", expenseH.Get)
		r.Patch("/api/groups/{groupID}/expenses/{expenseID}", expenseH.Update)
		r.Delete("/api/groups/{groupID}/expenses/{expenseID}", expenseH.Delete)

		r.Get("/api/groups/{groupID}/balances", balancesH.ListGroupBalances)
		r.Post("/api/groups/{groupID}/settle", balancesH.Settle)
		r.Get("/api/groups/{groupID}/settle-suggestions", balancesH.SuggestSettlements)
		r.Get("/api/me/balances", balancesH.ListMyBalances)
		r.Get("/api/me/activity", activityH.ListMyActivity)
	})

	// Hosted-only routes (Google, Apple auth)
	r.Group(func(r chi.Router) {
		r.Use(middleware.HostedOnly(cfg))
		// Social auth handlers added here
	})

	return r
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Max-Age", "300")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
