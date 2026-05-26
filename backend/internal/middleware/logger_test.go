package middleware

import "testing"

func TestRedactSensitiveQueryParams(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "no query string",
			in:   "/api/auth/verify",
			want: "/api/auth/verify",
		},
		{
			name: "no sensitive params",
			in:   "/api/groups?limit=10&offset=20",
			want: "/api/groups?limit=10&offset=20",
		},
		{
			name: "magic-link token",
			in:   "/api/auth/verify?token=abc123secret",
			want: "/api/auth/verify?token=REDACTED",
		},
		{
			name: "oauth code",
			in:   "/api/auth/google/callback?code=4%2F0Adeu5",
			want: "/api/auth/google/callback?code=REDACTED",
		},
		{
			name: "access_token in query",
			in:   "/foo?access_token=bearer-xyz",
			want: "/foo?access_token=REDACTED",
		},
		{
			name: "mixed sensitive + safe",
			in:   "/api/auth/verify?token=secret&redirect=%2Fhome",
			want: "/api/auth/verify?redirect=%2Fhome&token=REDACTED",
		},
		{
			name: "case-insensitive key",
			in:   "/api/auth/verify?Token=secret",
			want: "/api/auth/verify?Token=REDACTED",
		},
		{
			name: "id_token and refresh_token",
			in:   "/cb?id_token=a&refresh_token=b",
			want: "/cb?id_token=REDACTED&refresh_token=REDACTED",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := RedactSensitiveQueryParams(tc.in)
			if got != tc.want {
				t.Fatalf("redact(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}
