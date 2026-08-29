package voice

import "testing"

func testContext() Context {
	return Context{
		GroupID: "g1", GroupName: "Sweden Trip", Currency: "SEK", Language: "en",
		Categories: []string{"food", "groceries", "transport"},
		Members: []Member{
			{ID: "m1", Name: "Lucas"},
			{ID: "m2", Name: "Anna"},
			{ID: "m3", Name: "Sara"},
		},
		CallerMemberID: "m1",
		LocalDate:      "2026-08-29",
		Timezone:       "Europe/Stockholm",
	}
}

func TestHasMember(t *testing.T) {
	vc := testContext()
	if !vc.HasMember("m2") {
		t.Error("HasMember(m2) = false, want true")
	}
	if vc.HasMember("m9") {
		t.Error("HasMember(m9) = true, want false — an invented id must not resolve")
	}
	if vc.HasMember("") {
		t.Error(`HasMember("") = true, want false`)
	}
}

func TestCallerName(t *testing.T) {
	if got := testContext().CallerName(); got != "Lucas" {
		t.Errorf("CallerName() = %q, want Lucas", got)
	}
}

func TestCallerNameWhenCallerIsNotOnTheRoster(t *testing.T) {
	// Should not happen — the handler builds the roster and the caller id
	// from the same query — but returning "" beats panicking.
	vc := testContext()
	vc.CallerMemberID = "m99"
	if got := vc.CallerName(); got != "" {
		t.Errorf("CallerName() = %q, want empty string", got)
	}
}
