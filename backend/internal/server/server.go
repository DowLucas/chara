package server

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"

	"github.com/DowLucas/chara/internal/auth"
	"github.com/DowLucas/chara/internal/billing"
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

// FreeOCRCap is the anti-abuse cap on free OCR scans per UTC month for
// hosted-instance users in v1.0/v1.1. v1.2 will replace this with a
// tier-aware lookup once paid Chara Hosted launches.
const FreeOCRCap = 3

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

	// Public invite endpoints (see invite-deep-links spec Phase 1C).
	// Both are outside the auth/protocol middleware group — the token is the
	// bearer credential, and the preview / landing page must be reachable
	// pre-install so a recipient with no app can still see what they're being
	// invited to. The preview JSON endpoint is rate-limited (per-IP and
	// per-token) to discourage scraping; landing HTML is not (it's less
	// attractive than the JSON surface and rate-limiting it would block
	// legitimate refreshes).
	invitesH := handler.NewInviteHandler(pool, queries, cfg)
	r.Get("/i/{token}", invitesH.Landing)
	r.Group(func(r chi.Router) {
		r.Use(middleware.InviteRateLimit(30, 60))
		r.Get("/api/invites/{token}/preview", invitesH.Preview)
	})
	r.Get("/api/health/liveness", healthH.Liveness)
	r.Get("/api/health/readiness", healthH.Readiness)

	r.Post("/api/auth/magic-link", authH.MagicLink)
	r.Post("/api/auth/verify", authH.Verify)

	groupH := handler.NewGroupHandler(pool, queries, cfg)
	if store != nil {
		groupH = groupH.WithStorage(store)
	}
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
		r.Use(middleware.Authenticate(jwtSvc, queries))

		r.Get("/api/me", authH.Me)
		r.Patch("/api/me", authH.UpdateMe)
		r.Delete("/api/me", authH.DeleteMe)
		r.Post("/api/me/logout", authH.Logout)
		r.Post("/api/me/push-token", pushH.Register)
		r.Delete("/api/me/push-token", pushH.Delete)

		// Waitlist signup: collects emails when users hit soft gates during
		// the v1.0/v1.1 free beta (OCR cap, recurring request, etc.). Also
		// mounted on selfhost so future hosted-only triggers don't break
		// when a self-hoster turns on a feature flag — the table just won't
		// see rows since selfhost surfaces never show waitlist UI.
		waitlistH := handler.NewWaitlistHandler(queries)
		r.Post("/api/waitlist", waitlistH.Submit)

		r.Post("/api/groups", groupH.Create)
		r.Get("/api/groups", groupH.List)
		r.Get("/api/groups/{groupID}", groupH.Get)
		r.Patch("/api/groups/{groupID}", groupH.Update)
		r.Delete("/api/groups/{groupID}", groupH.Archive)
		r.Post("/api/groups/{groupID}/unarchive", groupH.Unarchive)
		r.Post("/api/groups/{groupID}/lock", groupH.Lock)
		r.Post("/api/groups/{groupID}/unlock", groupH.Unlock)
		r.Delete("/api/groups/{groupID}/permanent", groupH.PermanentDelete)
		r.Get("/api/groups/{groupID}/stats", groupH.Stats)
		r.Delete("/api/groups/{groupID}/members/{memberID}", groupH.RemoveMember)
		r.Get("/api/groups/{groupID}/members/{memberID}/can-leave", groupH.CanLeave)
		r.Get("/api/groups/{groupID}/invite-link", groupH.GetInviteLink)
		r.Post("/api/groups/{groupID}/invite-link/regenerate", groupH.RegenerateInviteToken)
		r.Post("/api/groups/join/{token}", groupH.JoinViaToken)

		recurringH := handler.NewRecurringHandler(pool, queries)
		r.Post("/api/groups/{groupID}/recurring", recurringH.Create)
		r.Get("/api/groups/{groupID}/recurring", recurringH.List)
		// resume-all-after-unlock comes BEFORE /{recurringID} so chi's
		// router doesn't treat "resume-all-after-unlock" as an id.
		r.Post("/api/groups/{groupID}/recurring/resume-all-after-unlock", recurringH.ResumeAllAfterUnlock)
		r.Get("/api/groups/{groupID}/recurring/{recurringID}", recurringH.Get)
		r.Patch("/api/groups/{groupID}/recurring/{recurringID}", recurringH.Update)
		r.Delete("/api/groups/{groupID}/recurring/{recurringID}", recurringH.Delete)
		r.Post("/api/groups/{groupID}/recurring/{recurringID}/pause", recurringH.Pause)
		r.Post("/api/groups/{groupID}/recurring/{recurringID}/resume", recurringH.Resume)

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
		r.Get("/api/me/net", balancesH.MyNet)
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
		//
		// On hosted instances we wrap the scan with the usage counter
		// (FreeOCRCap = 3/month, v1.0 anti-abuse). Self-hosters pay the
		// Gemini bill themselves, so no metering: pass a nil counter.
		if cfg.HasGemini() {
			receiptH := handler.NewReceiptHandler(receipt.NewGemini(cfg.GeminiAPIKey))
			if cfg.IsHosted() {
				receiptH = receiptH.WithCounter(billing.NewCounter(queries), FreeOCRCap)
			}
			r.Post("/api/receipts/scan", receiptH.Scan)
		}
	})

	// Hosted-only routes (Google, Apple auth)
	r.Group(func(r chi.Router) {
		r.Use(middleware.HostedOnly(cfg))
		if cfg.HasApple() {
			appleH, err := handler.NewAppleAuthHandler(context.Background(), pool, queries, cfg, jwtSvc)
			if err != nil {
				// Never panic the server because Apple's JWKS endpoint
				// happens to be down at boot — log and skip mounting.
				slog.Error("apple auth: failed to init handler", "error", err)
			} else {
				r.Post("/api/auth/apple/native", appleH.Native)
			}
		}
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
