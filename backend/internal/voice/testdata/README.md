# Voice eval fixtures

Recordings for `gemini_eval_test.go`, which is gated behind the
`geminieval` build tag and never runs in CI. They are **not committed** —
they are audio, and they have to be recorded by a person.

Record each as mono Opus at ~24 kbps, matching what the app uploads:

    ffmpeg -f pulse -i default -ac 1 -c:a libopus -b:a 24k testdata/<name>.ogg

| File | Say this | What it pins |
| --- | --- | --- |
| `en_single.ogg` | "I paid four hundred and eighty for dinner with Anna and Sara" | spoken numbers → digits; "I" binds to the speaker |
| `en_multi.ogg` | "I paid 340 for drinks and Anna paid 120 for the taxi" | one utterance, two expenses, different payers |
| `sv_single.ogg` | "Jag betalade 620 för mat, delat på alla" | Swedish; "delat på alla" is the whole group |
| `sv_exact.ogg` | "Anna tog biffen för 250, jag tog pastan för 180" | two dishes are ONE bill with an exact split |
| `mixed_code_switch.ogg` | "Jag betalade 400 for the hotel, split 70/30 with Johan" | code-switching; percentage split |
| `en_settlement.ogg` | "I paid Anna back 200" | a repayment must NOT become an expense |

A missing file skips its test rather than failing, so a partial set is
useful immediately. Run:

    cd backend && set -a && . ./.env.local && set +a && \
      go test -tags geminieval ./internal/voice/ -run TestVoiceEval -v
