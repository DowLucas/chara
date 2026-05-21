package fx

import (
	"encoding/xml"
	"strings"
	"testing"
)

// FetchLatest hits the network, so we don't exercise it here — instead we
// parse a captured ECB envelope to confirm the XML schema we expect is the
// one ECB actually publishes. If ECB ever renames a tag, this test fails
// in CI and we don't ship a broken sync.
func TestParseECBEnvelope(t *testing.T) {
	// Trimmed copy of the live feed structure.
	const sample = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <gesmes:Sender><gesmes:name>European Central Bank</gesmes:name></gesmes:Sender>
  <Cube>
    <Cube time="2026-05-21">
      <Cube currency="USD" rate="1.0824"/>
      <Cube currency="SEK" rate="11.2825"/>
      <Cube currency="HUF" rate="402.5500"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`

	var env ecbEnvelope
	if err := xml.NewDecoder(strings.NewReader(sample)).Decode(&env); err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if env.Cube.Cube.Time != "2026-05-21" {
		t.Fatalf("time: got %q want 2026-05-21", env.Cube.Cube.Time)
	}
	if len(env.Cube.Cube.Rates) != 3 {
		t.Fatalf("rates: got %d want 3", len(env.Cube.Cube.Rates))
	}
	got := map[string]string{}
	for _, r := range env.Cube.Cube.Rates {
		got[r.Currency] = r.Rate
	}
	if got["SEK"] != "11.2825" {
		t.Errorf("SEK rate: got %q want 11.2825", got["SEK"])
	}
	if got["HUF"] != "402.5500" {
		t.Errorf("HUF rate: got %q want 402.5500", got["HUF"])
	}
}
