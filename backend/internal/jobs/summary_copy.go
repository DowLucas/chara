package jobs

import "github.com/DowLucas/chara/internal/language"

// summaryPush is one locale's monthly-summary notification.
type summaryPush struct{ title, body string }

// summaryCopyByLanguage is the monthly summary push, per language.
//
// The strings are deliberately fixed — no month name, no amount, no count.
// Go's standard library has no localized month names and applies no plural
// rules, so anything the backend interpolated would arrive in English inside
// an otherwise translated sentence, or in the wrong plural form. The numbers
// live on the summary screen the push opens, where the app's i18n formats
// them properly.
//
// Keyed by internal/language codes; every entry there must appear here
// (asserted in summary_copy_test.go).
var summaryCopyByLanguage = map[string]summaryPush{
	"en": {"Your month in review", "Your monthly summary is ready — see where your money went."},
	"sv": {"Din månad i korthet", "Din månadssammanfattning är klar – se vart pengarna tog vägen."},
	"da": {"Din måned kort fortalt", "Din månedsoversigt er klar – se, hvor pengene blev af."},
	"no": {"Måneden din oppsummert", "Månedsoppsummeringen din er klar – se hvor pengene ble av."},
	"fi": {"Kuukautesi lyhyesti", "Kuukausiyhteenvetosi on valmis – katso, mihin rahasi kuluivat."},
	"de": {"Dein Monat im Rückblick", "Deine Monatsübersicht ist da – sieh, wohin dein Geld geflossen ist."},
	"fr": {"Votre mois en résumé", "Votre récapitulatif mensuel est prêt – voyez où est passé votre argent."},
	"es": {"Tu mes en resumen", "Tu resumen mensual está listo: mira en qué se fue tu dinero."},
	"it": {"Il tuo mese in sintesi", "Il tuo riepilogo mensile è pronto: scopri dove sono finiti i tuoi soldi."},
	"pt": {"O teu mês em resumo", "O teu resumo mensal está pronto — vê para onde foi o teu dinheiro."},
	"nl": {"Jouw maand in het kort", "Je maandoverzicht staat klaar – bekijk waar je geld heen ging."},
	"pl": {"Twój miesiąc w skrócie", "Twoje miesięczne podsumowanie jest gotowe – zobacz, na co poszły pieniądze."},
	"ja": {"今月のふりかえり", "月間サマリーができました。お金の使い道を見てみましょう。"},
	"zh": {"本月回顾", "你的月度总结已生成，看看钱都花在哪儿了。"},
	"ko": {"이번 달 돌아보기", "월간 요약이 준비됐어요. 어디에 썼는지 확인해 보세요."},
	"ar": {"شهرك باختصار", "ملخصك الشهري جاهز — اطّلع على أوجه إنفاقك."},
}

// summaryCopy returns the notification title and body for a user's locale.
//
// The locale is whatever users.locale holds, which is the raw tag the device
// reported (zh-Hans, nb-NO, pt-BR): normalize before looking up. Unknown,
// empty and untranslated codes fall back to English rather than sending an
// empty notification.
func summaryCopy(locale string) (title, body string) {
	code, ok := language.Normalize(locale)
	if !ok {
		code = "en"
	}
	c, ok := summaryCopyByLanguage[code]
	if !ok {
		c = summaryCopyByLanguage["en"]
	}
	return c.title, c.body
}
