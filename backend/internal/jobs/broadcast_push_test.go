//go:build integration

package jobs_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/DowLucas/chara/internal/jobs"
	"github.com/DowLucas/chara/testutil"
)

// A single device can own a push_tokens row under more than one user — the
// (user_id, token) uniqueness key allows it deliberately (see migration
// 000047). The broadcast must still reach that device once, not once per
// owning account.
func TestBroadcast_SharedTokenDeliveredOnce(t *testing.T) {
	env := testutil.NewEnv(t)
	shared := "ExponentPushToken[shared-" + ulidSuffix() + "]"
	first := testutil.CreateUser(t, env.Pool, "first-"+ulidSuffix()+"@test", "First")
	second := testutil.CreateUser(t, env.Pool, "second-"+ulidSuffix()+"@test", "Second")
	testutil.SeedPushToken(t, env.Pool, first.ID, shared)
	testutil.SeedPushToken(t, env.Pool, second.ID, shared)

	fake := &fakeExpoSender{}
	w := &jobs.BroadcastPushWorker{Pool: env.Pool, Queries: env.Queries, Expo: fake}
	require.NoError(t, jobs.BroadcastForTest(context.Background(), w, jobs.BroadcastPushArgs{
		Title: "Chara 1.4.2", Body: "Release note",
	}))

	sent := 0
	for _, call := range fake.calls {
		for _, m := range call {
			if m.To == shared {
				sent++
				require.Equal(t, "Chara 1.4.2", m.Title)
				require.Equal(t, "Release note", m.Body)
			}
		}
	}
	require.Equal(t, 1, sent, "a device owned by two accounts must get one broadcast")
}
