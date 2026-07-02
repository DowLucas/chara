package jobs

import "testing"

func TestBuildGroupDeepLink_MatchesMobileFormat(t *testing.T) {
	got := buildGroupDeepLink("https://chara.example.com", "grp_123")
	// PathEscape doesn't encode ':' (allowed in a path segment) — decoded by
	// the mobile side's decodeURIComponent, which leaves it untouched either
	// way, so this still round-trips to "https://chara.example.com".
	want := "chara://groups/https:%2F%2Fchara.example.com/grp_123"
	if got != want {
		t.Errorf("buildGroupDeepLink = %q, want %q", got, want)
	}
}

func TestBuildCopy_ExpenseAdded(t *testing.T) {
	title, body := buildCopy(PushNotifyArgs{
		EventKind: "expense_added", GroupName: "Trip", ActorName: "Alice",
		Title: "Dinner", AmountMinor: 4500, Currency: "SEK",
	})
	if title != "Trip" {
		t.Errorf("title = %q, want %q", title, "Trip")
	}
	want := "Alice added Dinner — 45.00 SEK"
	if body != want {
		t.Errorf("body = %q, want %q", body, want)
	}
}

func TestBuildCopy_SettlementRecorded(t *testing.T) {
	title, body := buildCopy(PushNotifyArgs{
		EventKind: "settlement_recorded", GroupName: "Trip", ActorName: "Alice",
		AmountMinor: 1000, Currency: "SEK",
	})
	if title != "Trip" {
		t.Errorf("title = %q, want %q", title, "Trip")
	}
	want := "Alice settled up — 10.00 SEK"
	if body != want {
		t.Errorf("body = %q, want %q", body, want)
	}
}
