package aiusage

import (
	"context"
	"errors"
	"testing"
)

type fakeStore struct {
	got  []Record
	ids  []string
	fail bool
}

func (f *fakeStore) Insert(_ context.Context, id string, rec Record) error {
	if f.fail {
		return errors.New("boom")
	}
	f.ids = append(f.ids, id)
	f.got = append(f.got, rec)
	return nil
}

func TestRecordReturnsAnIDAndStores(t *testing.T) {
	store := &fakeStore{}
	r := NewRecorder(store)
	id := r.Record(context.Background(), Record{
		UserID: "u1", Feature: "voice", Model: "gemini-3.5-flash",
		LatencyMS: 1200, Outcome: OutcomeOK, ExpenseCount: 2,
	})
	if id == "" {
		t.Fatal("Record returned an empty id")
	}
	if len(store.got) != 1 {
		t.Fatalf("stored %d records, want 1", len(store.got))
	}
	if store.ids[0] != id {
		t.Errorf("stored id %q, want the returned id %q", store.ids[0], id)
	}
	if store.got[0].ExpenseCount != 2 {
		t.Errorf("ExpenseCount = %d, want 2", store.got[0].ExpenseCount)
	}
}

func TestRecordSwallowsStoreFailures(t *testing.T) {
	// Telemetry must never fail a user's request.
	r := NewRecorder(&fakeStore{fail: true})
	if id := r.Record(context.Background(), Record{UserID: "u1", Feature: "ocr"}); id == "" {
		t.Error("Record returned empty id on store failure; want the id anyway")
	}
}

func TestNilRecorderIsSafe(t *testing.T) {
	var r *Recorder
	if id := r.Record(context.Background(), Record{}); id != "" {
		t.Errorf("nil Recorder returned %q, want empty string", id)
	}
}

func TestRecorderWithNilStoreIsSafe(t *testing.T) {
	r := NewRecorder(nil)
	if id := r.Record(context.Background(), Record{}); id != "" {
		t.Errorf("Recorder with nil store returned %q, want empty string", id)
	}
}
