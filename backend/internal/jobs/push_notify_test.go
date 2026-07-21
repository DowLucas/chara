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

// sentTokens flattens every message the fake received into a token set.
func sentTokens(f *fakeExpoSender) map[string]bool {
	out := map[string]bool{}
	for _, call := range f.calls {
		for _, m := range call {
			out[m.To] = true
		}
	}
	return out
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
		RecipientUserIDs: []string{other1.ID, other2.ID},
		Title:            "Dinner", AmountMinor: 4500, Currency: "SEK",
	}))

	require.Len(t, fake.calls, 1)
	sent := fake.calls[0]
	require.Len(t, sent, 2)
	for _, m := range sent {
		require.Contains(t, m.Body, "45.00 SEK")
		require.Equal(t, group.Name, m.Title)
		require.Equal(t, "chara://groups/https:%2F%2Fchara.example.com/"+group.ID, m.Data["url"])
	}
	tokens := sentTokens(fake)
	require.True(t, tokens["ExponentPushToken[other1]"])
	require.True(t, tokens["ExponentPushToken[other2]"])
	require.False(t, tokens["ExponentPushToken[actor]"])
}

// TestPushNotify_OnlyInvolvedUsersNotified is the regression test for the bug
// where every group member was notified regardless of involvement. A group
// member who is not in RecipientUserIDs must receive nothing.
func TestPushNotify_OnlyInvolvedUsersNotified(t *testing.T) {
	env := testutil.NewEnv(t)
	actor := testutil.CreateUser(t, env.Pool, "actor-"+ulidSuffix()+"@test", "Actor")
	group, actorMember := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", actor.ID, "Actor")
	involved := testutil.CreateUser(t, env.Pool, "involved-"+ulidSuffix()+"@test", "Involved")
	testutil.AddMember(t, env.Pool, group.ID, involved.ID, "Involved")
	bystander := testutil.CreateUser(t, env.Pool, "bystander-"+ulidSuffix()+"@test", "Bystander")
	testutil.AddMember(t, env.Pool, group.ID, bystander.ID, "Bystander")

	testutil.SeedPushToken(t, env.Pool, actorMember.UserID.String, "ExponentPushToken[actor]")
	testutil.SeedPushToken(t, env.Pool, involved.ID, "ExponentPushToken[involved]")
	testutil.SeedPushToken(t, env.Pool, bystander.ID, "ExponentPushToken[bystander]")

	fake := &fakeExpoSender{}
	w := &jobs.PushNotifyWorker{Pool: env.Pool, Queries: env.Queries, Expo: fake, BaseURL: "https://chara.example.com"}
	require.NoError(t, jobs.NotifyForTest(context.Background(), w, jobs.PushNotifyArgs{
		EventKind: "expense_added", GroupID: group.ID, GroupName: group.Name,
		ActorUserID: actor.ID, ActorName: "Actor",
		RecipientUserIDs: []string{involved.ID},
		Title:            "Dinner", AmountMinor: 4500, Currency: "SEK",
	}))

	tokens := sentTokens(fake)
	require.True(t, tokens["ExponentPushToken[involved]"], "the involved member should be notified")
	require.False(t, tokens["ExponentPushToken[bystander]"], "a group member not involved must NOT be notified")
	require.False(t, tokens["ExponentPushToken[actor]"], "the actor must never be notified")
}

// A caller may pass member ids instead of pre-resolved user ids; the worker
// resolves them (and still drops the actor). Resolving in the worker rather
// than at enqueue time is what lets a transient DB failure retry the job
// instead of the caller swallowing it into an empty, silently-successful set.
func TestPushNotify_ResolvesMemberIDsToUsers(t *testing.T) {
	env := testutil.NewEnv(t)
	actor := testutil.CreateUser(t, env.Pool, "actor-"+ulidSuffix()+"@test", "Actor")
	group, actorMember := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", actor.ID, "Actor")
	involved := testutil.CreateUser(t, env.Pool, "involved-"+ulidSuffix()+"@test", "Involved")
	involvedMember := testutil.AddMember(t, env.Pool, group.ID, involved.ID, "Involved")

	testutil.SeedPushToken(t, env.Pool, actorMember.UserID.String, "ExponentPushToken[actor]")
	testutil.SeedPushToken(t, env.Pool, involved.ID, "ExponentPushToken[involved]")

	fake := &fakeExpoSender{}
	w := &jobs.PushNotifyWorker{Pool: env.Pool, Queries: env.Queries, Expo: fake, BaseURL: "https://chara.example.com"}
	require.NoError(t, jobs.NotifyForTest(context.Background(), w, jobs.PushNotifyArgs{
		EventKind: "expense_added", GroupID: group.ID, GroupName: group.Name,
		ActorUserID: actor.ID, ActorName: "Actor",
		// Payer + participant as member ids, including the actor's own member —
		// the worker resolves them and then filters the actor back out.
		RecipientMemberIDs: []string{involvedMember.ID, actorMember.ID},
		Title:              "Dinner", AmountMinor: 4500, Currency: "SEK",
	}))

	tokens := sentTokens(fake)
	require.True(t, tokens["ExponentPushToken[involved]"], "the resolved involved member should be notified")
	require.False(t, tokens["ExponentPushToken[actor]"], "the actor must never be notified")
}

// The actor is filtered out even when a caller includes them in the recipient
// set (the payer is normally also a participant).
func TestPushNotify_ActorExcludedEvenWhenListed(t *testing.T) {
	env := testutil.NewEnv(t)
	actor := testutil.CreateUser(t, env.Pool, "actor-"+ulidSuffix()+"@test", "Actor")
	group, actorMember := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", actor.ID, "Actor")
	other := testutil.CreateUser(t, env.Pool, "other-"+ulidSuffix()+"@test", "Other")
	testutil.AddMember(t, env.Pool, group.ID, other.ID, "Other")

	testutil.SeedPushToken(t, env.Pool, actorMember.UserID.String, "ExponentPushToken[actor]")
	testutil.SeedPushToken(t, env.Pool, other.ID, "ExponentPushToken[other]")

	fake := &fakeExpoSender{}
	w := &jobs.PushNotifyWorker{Pool: env.Pool, Queries: env.Queries, Expo: fake, BaseURL: "https://chara.example.com"}
	require.NoError(t, jobs.NotifyForTest(context.Background(), w, jobs.PushNotifyArgs{
		EventKind: "expense_added", GroupID: group.ID, GroupName: group.Name,
		ActorUserID: actor.ID, ActorName: "Actor",
		RecipientUserIDs: []string{actor.ID, other.ID},
		Title:            "Dinner", AmountMinor: 4500, Currency: "SEK",
	}))

	tokens := sentTokens(fake)
	require.True(t, tokens["ExponentPushToken[other]"])
	require.False(t, tokens["ExponentPushToken[actor]"])
}

// No recipients means nothing to send — mirrors SettleReminderWorker's
// fail-closed posture rather than falling back to a group-wide blast.
func TestPushNotify_EmptyRecipientsNoOp(t *testing.T) {
	env := testutil.NewEnv(t)
	actor := testutil.CreateUser(t, env.Pool, "actor-"+ulidSuffix()+"@test", "Actor")
	group, _ := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", actor.ID, "Actor")
	other := testutil.CreateUser(t, env.Pool, "other-"+ulidSuffix()+"@test", "Other")
	testutil.AddMember(t, env.Pool, group.ID, other.ID, "Other")
	testutil.SeedPushToken(t, env.Pool, other.ID, "ExponentPushToken[other]")

	fake := &fakeExpoSender{}
	w := &jobs.PushNotifyWorker{Pool: env.Pool, Queries: env.Queries, Expo: fake, BaseURL: "https://chara.example.com"}
	require.NoError(t, jobs.NotifyForTest(context.Background(), w, jobs.PushNotifyArgs{
		EventKind: "expense_added", GroupID: group.ID, GroupName: group.Name,
		ActorUserID: actor.ID, ActorName: "Actor",
		Title: "Dinner", AmountMinor: 4500, Currency: "SEK",
	}))

	require.Empty(t, fake.calls)
}

func TestPushNotify_NoTokensNoOp(t *testing.T) {
	env := testutil.NewEnv(t)
	actor := testutil.CreateUser(t, env.Pool, "actor-"+ulidSuffix()+"@test", "Actor")
	group, _ := testutil.CreateGroup(t, env.Pool, "Trip", "SEK", actor.ID, "Actor")
	other := testutil.CreateUser(t, env.Pool, "other-"+ulidSuffix()+"@test", "Other")
	testutil.AddMember(t, env.Pool, group.ID, other.ID, "Other")

	fake := &fakeExpoSender{}
	w := &jobs.PushNotifyWorker{Pool: env.Pool, Queries: env.Queries, Expo: fake, BaseURL: "https://chara.example.com"}
	require.NoError(t, jobs.NotifyForTest(context.Background(), w, jobs.PushNotifyArgs{
		EventKind: "expense_added", GroupID: group.ID, GroupName: group.Name,
		ActorUserID: actor.ID, ActorName: "Actor",
		RecipientUserIDs: []string{other.ID},
		Title:            "Dinner", AmountMinor: 4500, Currency: "SEK",
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
		RecipientUserIDs: []string{other.ID},
		AmountMinor:      1000, Currency: "SEK",
	}))
	require.Len(t, fake.calls, 1)
}
