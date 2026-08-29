package voice

import (
	"fmt"
	"strings"

	"github.com/DowLucas/chara/internal/language"
)

// basePrompt is the instruction half of the prompt. The group-specific
// half — roster, currency, categories, today's date — is appended by
// buildPrompt, because it changes per request and must never be reused
// across groups.
const basePrompt = `You are turning a spoken sentence about shared expenses into structured data for a bill-splitting app.

Transcribe the audio, then extract EVERY expense mentioned. One sentence often contains several ("I paid 480 for dinner and Anna paid 120 for the taxi" is TWO expenses).

LANGUAGE — read this before anything else:
- The speaker may use ANY language, and may switch mid-sentence ("Jag betalade 400 for the hotel"). Handle whatever they use.
- "transcript" must be in the language actually SPOKEN. DO NOT translate it. The user reads it back to check and correct what they said, so it has to be their own words.
- "amount" must ALWAYS use a period as the decimal separator, never a comma, whatever the speaker's language does. Swedish "tolv komma femtio" and German "zwölf Komma fünfzig" are both "12.50". A comma here is rejected downstream and the expense is lost, so this rule matters more than it looks.
- Spoken numerals become digits, in any language: "four hundred and eighty", "fyrahundraåttio", "vierhundertachtzig" and "quatre-vingts" are amounts, not words.
- Colloquial currency words map to ISO 4217: "kronor"/"kr"/"spänn" are SEK, "bucks" USD, "quid" GBP, "euro"/"€" EUR. If the speaker names no currency, use the group currency below.
- Member names may be pronounced with another language's phonetics, or inflected ("Annas", "Sarah's"). Match them to the roster anyway.

For each expense return:
- source_phrase: the exact words from the transcript that produced this expense. Required — the app shows it to the user next to the draft.
- title: a SHORT natural description, 2-5 words, no trailing period. WRITE THIS FIELD IN {{LANGUAGE}} regardless of what language the speaker used — everyone in the group reads the same expense list, so the title must not follow whoever happened to record it.
- amount: the amount as a decimal string, e.g. "480.00". No currency symbol, no thousands separator, and a period for the decimal point as stated above.
- currency: the ISO 4217 code. Use the group currency below unless the speaker names a different one ("40 euros" is "EUR").
- category: ONE of {{CATEGORIES}}, or "" if nothing fits confidently. Do not guess.
- date: YYYY-MM-DD. Resolve relative dates ("yesterday", "last Friday") against TODAY given below. Default to TODAY.
- paid_by_member_id: the member id of whoever PAID. "I", "me", "my" mean the SPEAKER, whose id is marked below.
- participant_member_ids: member ids of everyone the expense is split BETWEEN. "everyone" / "all of us" means every member. "everyone except X" means every member minus X. If the speaker names nobody, return an empty array — the app will use the whole group.
- split_method: "equal", "exact", or "percentage".
- shares: ONLY for split_method "exact" — [{"member_id":"...","amount":"250.00"}]. Must sum EXACTLY to amount.
- percentages: ONLY for split_method "percentage" — [{"member_id":"...","percent":70}]. Must sum to 100.

Split rules:
- Default to "equal" unless the speaker gives per-person numbers.
- "Anna had the steak at 250, I had pasta at 180" is ONE expense of "430.00", split_method "exact", with shares 250 and 180.
- "split it 70/30" is split_method "percentage".

Use ONLY member ids from the roster below. NEVER invent an id. If you cannot tell which member a name refers to — two people share a first name, or the name is not on the roster — do NOT guess: add an entry to "questions" instead, and use your best available id in the expense.

questions: ask only when genuinely ambiguous. Each is {"id":"q1","text":"Which Anna did you mean?","options":[{"member_id":"m2","label":"Anna Lind"}]}. Return an empty array when nothing is ambiguous.

If the speaker describes paying someone BACK ("I paid Anna back 200", "settled up with Erik"), that is a settlement, not an expense. Do NOT return it as an expense. If the utterance contains NOTHING BUT settlements, respond with {"error":"settlement"} so the app can point the user at the settle screen.

Respond with a single JSON object and no other text:
{"transcript":"...","expenses":[...],"questions":[...]}

If you cannot make out the speech, respond with {"error":"unintelligible"}.
If you can hear it clearly but it contains no expense, respond with {"error":"no_expense"}.`

// buildPrompt appends the per-request group context to basePrompt. The
// roster is the load-bearing part: without ids the model cannot name a
// payer, and given names alone it would guess.
func buildPrompt(vc Context, answers []Answer) string {
	p := strings.Replace(basePrompt, "{{LANGUAGE}}", languageLabel(vc.Language), 1)
	p = strings.Replace(p, "{{CATEGORIES}}", strings.Join(quoteAll(vc.Categories), ", "), 1)

	var b strings.Builder
	b.WriteString(p)
	b.WriteString("\n\n--- THIS GROUP ---\n")
	fmt.Fprintf(&b, "Group currency: %s\n", vc.Currency)
	fmt.Fprintf(&b, "TODAY is %s (timezone %s)\n", vc.LocalDate, vc.Timezone)
	b.WriteString("Roster (member_id — name):\n")
	for _, m := range vc.Members {
		marker := ""
		if m.ID == vc.CallerMemberID {
			marker = `   <-- THIS IS THE SPEAKER; "I"/"me"/"my" refer to them`
		}
		fmt.Fprintf(&b, "  %s — %s%s\n", m.ID, m.Name, marker)
	}

	if len(answers) > 0 {
		b.WriteString("\n--- THE USER ALREADY ANSWERED THESE ---\n")
		for _, a := range answers {
			fmt.Fprintf(&b, "  %s: %s", a.QuestionID, a.Text)
			if a.MemberID != "" {
				fmt.Fprintf(&b, " (member_id %s)", a.MemberID)
			}
			b.WriteString("\n")
		}
		b.WriteString("Use these answers. Do NOT ask them again.\n")
	}
	return b.String()
}

// languageLabel resolves an ISO 639-1 code to a name the model
// understands. Unknown or empty falls back to the speaker's own language,
// which is at least readable rather than wrong.
func languageLabel(code string) string {
	if language.IsSupported(code) {
		return language.Name(code)
	}
	return "the speaker's own language"
}

func quoteAll(ss []string) []string {
	out := make([]string, len(ss))
	for i, s := range ss {
		out[i] = `"` + s + `"`
	}
	return out
}

// responseSchema constrains Gemini's JSON decoding. As in internal/receipt,
// response_mime_type alone still permits structurally invalid JSON, and —
// the harder-won lesson — requiring only some fields makes the model drop
// the rest. Everything the resolver reads is listed as required, so a
// missing field is a schema violation rather than a silently empty draft.
func responseSchema() map[string]any {
	str := map[string]any{"type": "string"}
	memberList := map[string]any{"type": "array", "items": str}

	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"transcript": str,
			"error":      str,
			"expenses": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"source_phrase":          str,
						"title":                  str,
						"amount":                 str,
						"currency":               str,
						"category":               str,
						"date":                   str,
						"paid_by_member_id":      str,
						"split_method":           str,
						"participant_member_ids": memberList,
						"shares": map[string]any{
							"type": "array",
							"items": map[string]any{
								"type": "object",
								"properties": map[string]any{
									"member_id": str,
									"amount":    str,
								},
								"required": []string{"member_id", "amount"},
							},
						},
						"percentages": map[string]any{
							"type": "array",
							"items": map[string]any{
								"type": "object",
								"properties": map[string]any{
									"member_id": str,
									"percent":   map[string]any{"type": "number"},
								},
								"required": []string{"member_id", "percent"},
							},
						},
					},
					"required": []string{
						"source_phrase", "title", "amount", "currency",
						"paid_by_member_id", "split_method", "participant_member_ids",
					},
				},
			},
			"questions": map[string]any{
				"type": "array",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"id":   str,
						"text": str,
						"options": map[string]any{
							"type": "array",
							"items": map[string]any{
								"type": "object",
								"properties": map[string]any{
									"member_id": str,
									"label":     str,
								},
								"required": []string{"member_id", "label"},
							},
						},
					},
					"required": []string{"id", "text", "options"},
				},
			},
		},
		"required": []string{"transcript", "expenses", "questions"},
	}
}
