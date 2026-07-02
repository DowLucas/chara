//go:build integration

package jobs_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/DowLucas/chara/internal/jobs"
	"github.com/DowLucas/chara/internal/pushsend"
	"github.com/DowLucas/chara/testutil"
)

// fakeExpoSender records every Send call for assertions instead of hitting
// the network.
type fakeExpoSender struct {
	calls [][]pushsend.Message
	err   error
}

func (f *fakeExpoSender) Send(ctx context.Context, msgs []pushsend.Message) error {
	f.calls = append(f.calls, msgs)
	return f.err
}

func TestPushNotify_HappyPath(t *testing.T) {
	env := testutil.NewEnv(t)
	actor := testutil.CreateUser(t, env.Pool, "actor-"+ulidSuffix()+"@test", "Actor")
	group, actorMember := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", actor.ID, "Actor")
	other1 := testutil.CreateUser(t, env.Pool, "other1-"+ulidSuffix()+"@test", "Other One")
	testutil.AddMember(t, env.Pool, group.ID, other1.ID, "Other One")
	other2 := testutil.CreateUser(t, env.Pool, "other2-"+ulidSuffix()+"@test", "Other Two")
	testutil.AddMember(t, env.Pool, group.ID, other2.ID, "Other Two")

	testutil.SeedPushToken(t, env.Pool, actorMember.UserID.String, "ExponentPushToken[actor]")
	testutil.SeedPushToken(t, env.Pool, other1.ID, "ExponentPushToken[other1]")
	testutil.SeedPushToken(t, env.Pool, other2.ID, "ExponentPushToken[other2]")

	fake := &fakeExpoSender{}
	w := &jobs.PushNotifyWorker{Pool: env.Pool, Queries: env.Queries, Expo: fake, BaseURL: "https://chara.example.com"}
	require.NoError(t, jobs.NotifyForTest(context.Background(), w, jobs.PushNotifyArgs{
		EventKind: "expense_added", GroupID: group.ID, GroupName: group.Name,
		ActorUserID: actor.ID, ActorName: "Actor",
		Title: "Dinner", AmountMinor: 4500, Currency: "SEK",
	}))

	require.Len(t, fake.calls, 1)
	sent := fake.calls[0]
	require.Len(t, sent, 2)
	tokens := map[string]bool{}
	for _, m := range sent {
		tokens[m.To] = true
		require.Contains(t, m.Body, "45.00 SEK")
		require.Equal(t, group.Name, m.Title)
		require.Equal(t, "chara://groups/https%3A%2F%2Fchara.example.com/"+group.ID, m.Data["url"])
	}
	require.True(t, tokens["ExponentPushToken[other1]"])
	require.True(t, tokens["ExponentPushToken[other2]"])
	require.False(t, tokens["ExponentPushToken[actor]"])
}

func TestPushNotify_NoTokensNoOp(t *testing.T) {
	env := testutil.NewEnv(t)
	actor := testutil.CreateUser(t, env.Pool, "actor-"+ulidSuffix()+"@test", "Actor")
	group, _ := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", actor.ID, "Actor")

	fake := &fakeExpoSender{}
	w := &jobs.PushNotifyWorker{Pool: env.Pool, Queries: env.Queries, Expo: fake, BaseURL: "https://chara.example.com"}
	require.NoError(t, jobs.NotifyForTest(context.Background(), w, jobs.PushNotifyArgs{
		EventKind: "expense_added", GroupID: group.ID, GroupName: group.Name,
		ActorUserID: actor.ID, ActorName: "Actor",
		Title: "Dinner", AmountMinor: 4500, Currency: "SEK",
	}))

	require.Empty(t, fake.calls)
}

func TestPushNotify_SendErrorDoesNotFailJob(t *testing.T) {
	env := testutil.NewEnv(t)
	actor := testutil.CreateUser(t, env.Pool, "actor-"+ulidSuffix()+"@test", "Actor")
	group, _ := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", actor.ID, "Actor")
	other := testutil.CreateUser(t, env.Pool, "other-"+ulidSuffix()+"@test", "Other")
	testutil.AddMember(t, env.Pool, group.ID, other.ID, "Other")
	testutil.SeedPushToken(t, env.Pool, other.ID, "ExponentPushToken[other]")

	fake := &fakeExpoSender{err: context.DeadlineExceeded}
	w := &jobs.PushNotifyWorker{Pool: env.Pool, Queries: env.Queries, Expo: fake, BaseURL: "https://chara.example.com"}
	require.NoError(t, jobs.NotifyForTest(context.Background(), w, jobs.PushNotifyArgs{
		EventKind: "settlement_recorded", GroupID: group.ID, GroupName: group.Name,
		ActorUserID: actor.ID, ActorName: "Actor",
		AmountMinor: 1000, Currency: "SEK",
	}))
	require.Len(t, fake.calls, 1)
}
