// Package currency is the backend allowlist of ISO 4217 currency codes Chara
// accepts. The list intentionally mirrors app/lib/currencies.ts so a code
// that surfaces in the picker is the same code the server will accept; keep
// them in sync.
package currency

import "strings"

// known is the set of accepted ISO 4217 alphabetic codes. Maintain in sync
// with app/lib/currencies.ts. Excludes accounting/fund codes (BOV, CHE,
// CHW, CLF, COU, MXV, USN, UYI, UYW), retired codes (ANG, BGN), and the
// precious-metals/SDR Xxx codes.
var known = map[string]struct{}{
	"AED": {}, "AFN": {}, "ALL": {}, "AMD": {}, "AOA": {}, "ARS": {}, "AUD": {}, "AWG": {},
	"AZN": {}, "BAM": {}, "BBD": {}, "BDT": {}, "BHD": {}, "BIF": {}, "BMD": {}, "BND": {},
	"BOB": {}, "BRL": {}, "BSD": {}, "BTN": {}, "BWP": {}, "BYN": {}, "BZD": {}, "CAD": {},
	"CDF": {}, "CHF": {}, "CLP": {}, "CNY": {}, "COP": {}, "CRC": {}, "CUP": {}, "CVE": {},
	"CZK": {}, "DJF": {}, "DKK": {}, "DOP": {}, "DZD": {}, "EGP": {}, "ERN": {}, "ETB": {},
	"EUR": {}, "FJD": {}, "FKP": {}, "GBP": {}, "GEL": {}, "GHS": {}, "GIP": {}, "GMD": {},
	"GNF": {}, "GTQ": {}, "GYD": {}, "HKD": {}, "HNL": {}, "HTG": {}, "HUF": {}, "IDR": {},
	"ILS": {}, "INR": {}, "IQD": {}, "IRR": {}, "ISK": {}, "JMD": {}, "JOD": {}, "JPY": {},
	"KES": {}, "KGS": {}, "KHR": {}, "KMF": {}, "KPW": {}, "KRW": {}, "KWD": {}, "KYD": {},
	"KZT": {}, "LAK": {}, "LBP": {}, "LKR": {}, "LRD": {}, "LSL": {}, "LYD": {}, "MAD": {},
	"MDL": {}, "MGA": {}, "MKD": {}, "MMK": {}, "MNT": {}, "MOP": {}, "MRU": {}, "MUR": {},
	"MVR": {}, "MWK": {}, "MXN": {}, "MYR": {}, "MZN": {}, "NAD": {}, "NGN": {}, "NIO": {},
	"NOK": {}, "NPR": {}, "NZD": {}, "OMR": {}, "PAB": {}, "PEN": {}, "PGK": {}, "PHP": {},
	"PKR": {}, "PLN": {}, "PYG": {}, "QAR": {}, "RON": {}, "RSD": {}, "RUB": {}, "RWF": {},
	"SAR": {}, "SBD": {}, "SCR": {}, "SDG": {}, "SEK": {}, "SGD": {}, "SHP": {}, "SLE": {},
	"SOS": {}, "SRD": {}, "SSP": {}, "STN": {}, "SVC": {}, "SYP": {}, "SZL": {}, "THB": {},
	"TJS": {}, "TMT": {}, "TND": {}, "TOP": {}, "TRY": {}, "TTD": {}, "TWD": {}, "TZS": {},
	"UAH": {}, "UGX": {}, "USD": {}, "UYU": {}, "UZS": {}, "VES": {}, "VND": {}, "VUV": {},
	"WST": {}, "XAF": {}, "XCD": {}, "XCG": {}, "XOF": {}, "XPF": {}, "YER": {}, "ZAR": {},
	"ZMW": {}, "ZWG": {},
}

// IsValid reports whether code is an accepted ISO 4217 alphabetic code.
// The check is case-insensitive; canonical storage form is uppercase.
func IsValid(code string) bool {
	_, ok := known[strings.ToUpper(code)]
	return ok
}

// Normalize uppercases and trims the code. Returns ("", false) for unknown
// input so callers can reject in one step.
func Normalize(code string) (string, bool) {
	up := strings.ToUpper(strings.TrimSpace(code))
	if _, ok := known[up]; !ok {
		return "", false
	}
	return up, true
}
