package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"

	"github.com/DowLucas/chara/internal/auth"
	"github.com/DowLucas/chara/internal/config"
	"github.com/DowLucas/chara/internal/db"
	"github.com/DowLucas/chara/internal/handler"
	"github.com/DowLucas/chara/internal/middleware"
	"github.com/DowLucas/chara/internal/receipt"
	"github.com/DowLucas/chara/internal/storage"
	"github.com/DowLucas/chara/internal/wellknown"
	"github.com/jackc/pgx/v5/pgxpool"
)

const version = "0.1.0"

func New(cfg *config.Config, pool *pgxpool.Pool, queries *db.Queries, jwtSvc *auth.JWTService, store *storage.Client) http.Handler {
	r := chi.NewRouter()

	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(corsMiddleware)
	r.Use(chimiddleware.Compress(5))

	healthH := handler.NewHealthHandler(pool)
	authH := handler.NewAuthHandler(pool, queries, cfg, jwtSvc)

	wellknownHandler := wellknown.Handler(cfg, version)
	r.Get("/.well-known/chara-instance", wellknownHandler)
	// DEPRECATED: alias for /.well-known/chara-instance for one release of
	// grace during the Quits → Chara rename. Remove after v0.2.
	r.Get("/.well-known/quits-instance", wellknownHandler)
	r.Get("/api/health/liveness", healthH.Liveness)
	r.Get("/api/health/readiness", healthH.Readiness)

	r.Post("/api/auth/magic-link", authH.MagicLink)
	r.Post("/api/auth/verify", authH.Verify)

	groupH := handler.NewGroupHandler(pool, queries, cfg)
	expenseH := handler.NewExpenseHandler(pool, queries)
	if store != nil {
		expenseH = expenseH.WithStorage(store)
	}
	balancesH := handler.NewBalancesHandler(pool, queries)
	activityH := handler.NewActivityHandler(pool, queries)
	fxH := handler.NewFxHandler(queries)

	pushH := handler.NewPushTokenHandler(pool, queries)

	// Authenticated routes. The protocol-version middleware runs here (not on
	// /.well-known/* or /api/health/*) so out-of-range clients can still read
	// the current min/max and recover. See spec §9.
	r.Group(func(r chi.Router) {
		r.Use(middleware.ProtocolVersion(cfg.MinAppProtocol, cfg.MaxAppProtocol))
		r.Use(middleware.Authenticate(jwtSvc))

		r.Get("/api/me", authH.Me)
		r.Patch("/api/me", authH.UpdateMe)
		r.Post("/api/me/logout", authH.Logout)
		r.Post("/api/me/push-token", pushH.Register)
		r.Delete("/api/me/push-token", pushH.Delete)

		r.Post("/api/groups", groupH.Create)
		r.Get("/api/groups", groupH.List)
		r.Get("/api/groups/{groupID}", groupH.Get)
		r.Patch("/api/groups/{groupID}", groupH.Update)
		r.Delete("/api/groups/{groupID}", groupH.Archive)
		r.Get("/api/groups/{groupID}/invite-link", groupH.GetInviteLink)
		r.Post("/api/groups/{groupID}/invite-link/regenerate", groupH.RegenerateInviteToken)
		r.Post("/api/groups/join/{token}", groupH.JoinViaToken)

		r.Post("/api/groups/{groupID}/expenses", expenseH.Create)
		r.Get("/api/groups/{groupID}/expenses", expenseH.List)
		r.Get("/api/groups/{groupID}/expenses/{expenseID}", expenseH.Get)
		r.Patch("/api/groups/{groupID}/expenses/{expenseID}", expenseH.Update)
		r.Delete("/api/groups/{groupID}/expenses/{expenseID}", expenseH.Delete)

		r.Get("/api/groups/{groupID}/balances", balancesH.ListGroupBalances)
		r.Post("/api/groups/{groupID}/settle", balancesH.Settle)
		r.Get("/api/groups/{groupID}/settlements", balancesH.ListSettlements)
		r.Post("/api/groups/{groupID}/settlements/{settlementID}/revert", balancesH.RevertSettlement)
		r.Get("/api/groups/{groupID}/settle-suggestions", balancesH.SuggestSettlements)
		r.Get("/api/me/balances", balancesH.ListMyBalances)
		r.Get("/api/me/activity", activityH.ListMyActivity)
		r.Get("/api/groups/{groupID}/activity", activityH.ListGroupActivity)

		r.Get("/api/fx/rates", fxH.Rates)
		r.Get("/api/fx/convert", fxH.Convert)

		// Receipt attachments only mount when object storage is configured.
		// Without it, the upload endpoint would 500 on every call; better to
		// surface a clean 404 so the client can hide the affordance.
		if store != nil {
			attachH := handler.NewAttachmentHandler(pool, queries, store)
			r.Post("/api/groups/{groupID}/expenses/{expenseID}/attachments", attachH.Create)
			r.Get("/api/groups/{groupID}/expenses/{expenseID}/attachments", attachH.List)
			r.Get("/api/groups/{groupID}/expenses/{expenseID}/attachments/{attachmentID}/content", attachH.Content)
			r.Delete("/api/groups/{groupID}/expenses/{expenseID}/attachments/{attachmentID}", attachH.Delete)

			avatarH := handler.NewAvatarHandler(pool, queries, store)
			r.Post("/api/me/avatar", avatarH.Upload)
			r.Delete("/api/me/avatar", avatarH.Delete)
			r.Get("/api/users/{userID}/avatar", avatarH.Get)
		}

		// Receipt OCR is only mounted when a Gemini key is configured. Self-hosters
		// who skip GEMINI_API_KEY simply do not see the feature (the instance
		// advertises features.ocr=false via /.well-known/chara-instance).
		if cfg.HasGemini() {
			receiptH := handler.NewReceiptHandler(receipt.NewGemini(cfg.GeminiAPIKey))
			r.Post("/api/receipts/scan", receiptH.Scan)
		}
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
