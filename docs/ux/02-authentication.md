# UX Diagrams — Authentication

## 2.1 Magic Link Auth Flow  `P0`

User enters email, receives magic link via email, taps link which opens app via deep link, exchanges token for JWT, or handles expiry/wrong device. Available on both hosted and self-hosted.

```mermaid
flowchart TD
    A["Sign In Screen"] -->|Tap 'Sign in with email'| B["Email Input Screen"]
    B -->|Enter email + Tap Send| C["API: POST /auth/magic-link"]
    C -->|Success| D["Confirmation Screen\nCheck your email"]
    C -->|Error: invalid email| B
    D -->|User taps link in email| E["Deep Link Callback\nchara://auth?token=XXX"]
    E -->|Token valid + Same device| F["Exchange Token for JWT\nPOST /auth/verify-magic-link"]
    E -->|Token expired| G["Expired Link Screen\nAsk to resend"]
    E -->|Wrong device/no secure store| H["Prompt: Complete sign-in\nEnter email again"]
    F -->|JWT issued + Stored| I["Home Screen"]
    G -->|Resend| C
    H -->|Retry| B
```

---

## 2.2 Sign In Screen Variants  `P0`

The sign-in screen adapts based on whether the app is pointed at a hosted or self-hosted instance. The app detects instance type from the API's `/.well-known/chara-instance` endpoint.

```mermaid
flowchart TD
    A["App Launch"] -->|Fetch instance config| B{Instance type?}
    B -->|Hosted| C["Sign In Screen — Hosted\n─────────────────\n✉ Continue with Email\nG  Continue with Google\n  Sign in with Apple\n─────────────────\nSelf-host? Enter server URL"]
    B -->|Self-hosted| D["Sign In Screen — Self-hosted\n─────────────────\n✉ Continue with Email\n🔑 Sign in with SSO\n─────────────────\nChange server URL"]
    B -->|Unknown / first launch| E["Server URL Entry Screen"]
    E -->|Enter URL + Validate| B
    C -->|Tap Email| F["Magic Link Flow"]
    C -->|Tap Google| G["Google OAuth Flow"]
    C -->|Tap Apple| H["Apple Sign In Flow"]
    D -->|Tap Email| F
    D -->|Tap SSO| I["OIDC Flow"]
```

---

## 2.3 Google OAuth Flow  `P0` *(Hosted tier only)*

User taps "Continue with Google", system browser opens Google consent screen, redirect callback triggered, JWT issued, or error handling for denial/existing email.

```mermaid
flowchart TD
    A["Sign In Screen\n(Hosted)"] -->|Tap 'Continue with Google'| B["Open System Browser\nGoogle OAuth"]
    B -->|User consents| C["Google Redirect Callback\nOAuth Code + State"]
    B -->|User denies| D["Denial Screen\nBack to Sign In"]
    C -->|POST /auth/google/callback| E{Email already\nregistered?}
    E -->|No| F["Create Account\nIssue JWT"]
    E -->|Yes| G["Existing User\nIssue JWT"]
    F -->|Stored in SecureStore| H["New User Onboarding\nDisplay Name + Avatar"]
    G -->|Stored in SecureStore| I["Home Screen"]
    H -->|Complete| I
    D -->|Tap Retry| A
```

---

## 2.4 Apple Sign In Flow  `P0` *(Hosted tier only, iOS only)*

Native `ASAuthorizationAppleIDProvider` sheet — no browser redirect. Apple returns a signed `identity_token` directly to the app. Backend verifies against Apple's public JWKS. Not available on self-hosted instances.

```mermaid
flowchart TD
    A["Sign In Screen\n(Hosted, iOS)"] -->|Tap 'Sign in with Apple'| B["Native Apple Sheet\nASAuthorizationAppleIDProvider"]
    B -->|User authenticates| C["App receives identity_token\n+ authorizationCode"]
    B -->|User cancels| D["Back to Sign In"]
    C -->|POST /auth/apple| E["API: Verify identity_token\nvs Apple JWKS"]
    E -->|Invalid token| F["Error: Auth failed\nBack to Sign In"]
    E -->|Valid| G{User exists?}
    G -->|First sign-in| H["Create Account\nPersist name + email\n(only provided once by Apple)"]
    G -->|Returning user| I["Issue JWT\n(sub only, no email re-sent)"]
    H -->|JWT issued| J["New User Onboarding"]
    I -->|Stored in SecureStore| K["Home Screen"]
    J -->|Complete| K
    F -->|Retry| A
```

---

## 2.5 OIDC / SSO Flow (Self-hosted)  `P0`

Self-hosters configure an OIDC instance URL (Authentik, Keycloak, Authelia, etc.). This is the primary social login path for self-hosted instances — replaces Google/Apple.

```mermaid
flowchart TD
    A["Sign In Screen\n(Self-hosted)"] -->|Tap 'Sign in with SSO'| B["OIDC Instance URL Screen"]
    B -->|Enter URL + Validate| C{URL\nvalid?}
    C -->|No| D["Error: Invalid URL"]
    D -->|Retry| B
    C -->|Yes| E["Store OIDC Config\nDiscover endpoints"]
    E -->|POST /auth/oidc/authorize| F["Redirect to OIDC Provider\nBrowser"]
    F -->|User consents| G["OIDC Provider Callback\nAuth Code + State"]
    F -->|User denies| H["Denial Screen\nBack to Sign In"]
    G -->|Exchange Code for Token\nPOST /auth/oidc/callback| I["JWT Issued\nStore in SecureStore"]
    I -->|Existing User| J["Home Screen"]
    I -->|New User| K["Onboarding Flow"]
    H -->|Retry| B
```

---

## 2.6 First-Launch Onboarding Flow  `P0`

New user post-auth: required display name + avatar, optional Swish phone, optional Splitwise import, then empty home with call-to-action.

```mermaid
flowchart TD
    A["Auth Success\nNew User"] -->|Onboarding Modal| B["Screen 1: Display Name + Avatar\nRequired"]
    B -->|Valid input + Tap Next| C["Screen 2: Swish Phone\nOptional"]
    B -->|Tap Skip| C
    C -->|Enter phone| D["Validate + Store"]
    C -->|Tap Skip| E["Screen 3: Splitwise Import\nOptional"]
    D -->|Invalid| C
    E -->|Tap 'Connect Splitwise'| F["OAuth redirect to Splitwise\nImport groups + expenses"]
    E -->|Tap Skip| G["Onboarding Complete"]
    F -->|Success| G
    F -->|Error| E
    G -->|Dismiss| H["Home Screen\nEmpty State + CTA\n'Create your first group'"]
```

---

## 2.7 Deep Link Callback Handling  `P0`

All incoming deep links routed: auth tokens, group invites, expense notifications, settlements. Decision tree determines screen and navigation context.

```mermaid
flowchart TD
    A["App receives Deep Link\nchara://..."] -->|Parse URL| B{Link Type?}
    B -->|auth?token=XXX| C["Magic Link Callback\nExchange token for JWT"]
    B -->|auth/callback?code=YYY| CC["OAuth Callback\nGoogle or OIDC code exchange"]
    B -->|group/invite?code=YYY| D["Group Invite Callback\nValidate code + Join"]
    B -->|expense/YYY| E["Expense Detail Deep Link\nNavigate if authenticated"]
    B -->|settlement/ZZZ| F["Settlement Detail Deep Link\nNavigate if authenticated"]
    B -->|Unknown| G["Log error\nIgnore link"]
    C -->|JWT valid| H["Authenticated State\nHome Screen"]
    C -->|JWT invalid/expired| I["Re-auth Prompt"]
    CC -->|JWT issued| H
    CC -->|Error| I
    D -->|Code valid| J["Show Group Details\nConfirm join"]
    D -->|Code invalid| K["Error: Invalid invite"]
    E -->|User authenticated| L["Show Expense Detail"]
    E -->|Not authenticated| M["Queue link\nShow after auth"]
    F -->|User authenticated| N["Show Settlement"]
    F -->|Not authenticated| O["Queue link\nShow after auth"]
    J -->|Tap Confirm| P["Join group\nShow home"]
    K -->|Dismiss| I
```

---

## 2.8 Session Expiry + Re-Auth Flow  `P0`

JWT expires during session. App attempts silent refresh. If refresh fails, re-auth options shown depend on instance type (hosted vs self-hosted).

```mermaid
stateDiagram-v2
    [*] --> Authenticated: JWT Valid

    Authenticated --> CheckExpiry: API call made
    CheckExpiry --> Authenticated: JWT still valid
    CheckExpiry --> RefreshAttempt: JWT expired

    RefreshAttempt --> RefreshSuccess: Refresh token valid
    RefreshAttempt --> RefreshFailed: Refresh token expired/invalid

    RefreshSuccess --> Authenticated: New JWT issued
    RefreshFailed --> ReAuthPrompt: Show re-auth modal

    ReAuthPrompt --> SignInFlow: Tap 'Sign in'\n(shows tier-appropriate options)
    SignInFlow --> Authenticated: New JWT issued

    ReAuthPrompt --> PartialState: Tap 'Cancel'
    PartialState --> ReAuthPrompt: Retry on next action
    PartialState --> SignInFlow: User re-authenticates
    SignInFlow --> ReplayAction: Resume queued action
    ReplayAction --> Authenticated
```

---

## 2.9 Sign Out Flow  `P0`

User initiates sign out from profile. Confirmation prompt, JWT cleared, push token deregistered, welcome screen shown with tier-appropriate sign-in options.

```mermaid
flowchart TD
    A["Profile Screen"] -->|Tap 'Sign Out'| B["Confirmation Modal\nAre you sure?"]
    B -->|Tap 'Cancel'| A
    B -->|Tap 'Sign Out'| C["API: POST /auth/logout"]
    C -->|Deregister push token\nPOST /push/unsubscribe| D["Clear JWT from SecureStore"]
    D -->|Clear local cache\nClear auth state| E["Transition to Welcome Screen"]
    E -->|Hosted instance| F["Sign In Screen\nEmail · Google · Apple"]
    E -->|Self-hosted instance| G["Sign In Screen\nEmail · SSO"]
```
