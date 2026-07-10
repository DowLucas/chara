//go:build integration

package handler_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivertest"
	"github.com/stretchr/testify/require"

	"github.com/DowLucas/chara/internal/jobs"
	"github.com/DowLucas/chara/internal/server"
)

const adminToken = "test-admin-secret"

func TestAdmin_Broadcast_EnqueuesForAllDevices(t *testing.T) {
	env, _, _, _, _, _ := setupExpenseEnv(t)
	env.Config.AdminAPIToken = adminToken
	rc := newInsertOnlyRiverClient(t, env)
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil, rc)

	body := `{"title":"Chara 1.2.0","body":"Recurring bills + settle reminders"}`
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/admin/notify", body, adminToken))
	require.Equal(t, http.StatusAccepted, rr.Code)

	job := rivertest.RequireInserted(context.Background(), t, riverpgxv5.New(env.Pool), &jobs.BroadcastPushArgs{}, nil)
	require.Equal(t, "Chara 1.2.0", job.Args.Title)
	require.Equal(t, "Recurring bills + settle reminders", job.Args.Body)
	require.Equal(t, "", job.Args.URL)
}

func TestAdmin_Broadcast_WrongTokenUnauthorized(t *testing.T) {
	env, _, _, _, _, _ := setupExpenseEnv(t)
	env.Config.AdminAPIToken = adminToken
	rc := newInsertOnlyRiverClient(t, env)
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil, rc)

	body := `{"title":"x","body":"y"}`
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/admin/notify", body, "not-the-token"))
	require.Equal(t, http.StatusUnauthorized, rr.Code)

	rivertest.RequireNotInserted(context.Background(), t, riverpgxv5.New(env.Pool), &jobs.BroadcastPushArgs{}, nil)
}

func TestAdmin_Broadcast_DisabledWhenTokenUnset(t *testing.T) {
	// setupExpenseEnv leaves AdminAPIToken empty and wires a router already.
	env, _, _, _, _, _ := setupExpenseEnv(t)

	body := `{"title":"x","body":"y"}`
	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/admin/notify", body, "anything"))
	require.Equal(t, http.StatusNotFound, rr.Code)
}

func TestAdmin_Broadcast_RequiresTitleAndBody(t *testing.T) {
	env, _, _, _, _, _ := setupExpenseEnv(t)
	env.Config.AdminAPIToken = adminToken
	rc := newInsertOnlyRiverClient(t, env)
	env.Router = server.New(env.Config, env.Pool, env.Queries, env.JWT, nil, rc)

	rr := env.Do(t, env.AuthRequest(t, "POST", "/api/admin/notify", `{"title":"only title"}`, adminToken))
	require.Equal(t, http.StatusBadRequest, rr.Code)

	rivertest.RequireNotInserted(context.Background(), t, riverpgxv5.New(env.Pool), &jobs.BroadcastPushArgs{}, nil)
}
