# UX Diagrams — Balances & Settle Up

## 7.1 Group Balance Screen Layout  `P0`
Tabular view listing per-member net balances with "You owe" and "Owed to you" sections, each with settle-up affordances and an optional simplified view toggle.

```mermaid
flowchart TD
    A["Group Balance Screen"] --> B["Simplified View Toggle<br/>(optional, P1)"]
    A --> C["You Owe Section"]
    A --> D["Owed to You Section"]
    
    C --> C1["Member Name + Amount"]
    C --> C2["Settle Up Button"]
    
    D --> D1["Member Name + Amount"]
    D --> D2["Settle Up Button"]
    
    B --> B1["Toggle between raw &<br/>simplified splits"]
    
    C2 --> C3["Open Settle Flow"]
    D2 --> D3["Open Settle Flow"]
    
    style A fill:#e1f5ff
    style C fill:#ffebee
    style D fill:#e8f5e9
    style B fill:#f3e5f5
```

---

## 7.2 Settle Up Flow — Manual Mark as Paid  `P0`
User initiates settlement by tapping settle button, confirming the pre-filled amount, then marking as paid via a confirmation dialog.

```mermaid
sequenceDiagram
    participant User as User<br/>(Payer)
    participant App as Quits App
    participant DB as Database
    participant Notif as Notification<br/>Service
    participant Payee as Payee
    
    User->>App: Tap "Settle up with Alice"
    App->>App: Pre-fill balance amount<br/>(240 SEK)
    App->>User: Show settle screen<br/>(amount, confirm)
    User->>App: Confirm amount
    User->>App: Tap "Mark as Paid"
    App->>DB: Create settlement record<br/>(payer, payee, amount)
    DB->>DB: Update expense_splits<br/>to mark settled
    App->>DB: Recalculate balances
    App->>Notif: Send "Alice paid you<br/>240 SEK" push
    Notif->>Payee: Push notification
    App->>User: Show "Settled" confirmation<br/>Update balance view
```

---

## 7.3 Settle Up with Swish Flow  `P0`
User taps Swish payment option, Quits builds a Swish deep link with payee phone, amount, and message, opens the Swish app, then prompts for confirmation upon return.

```mermaid
flowchart TD
    A["User taps<br/>Settle with Swish"] --> B["Quits builds swish:// URL<br/>payee_phone + amount + message"]
    B --> C["System opens Swish app"]
    C --> D{Swish<br/>installed?}
    D -->|Yes| E["User confirms payment<br/>in Swish app"]
    D -->|No| F["Fallback: show Swish<br/>not installed message"]
    E --> G["User returns to Quits<br/>or Swish redirects"]
    G --> H["Show Mark as Paid prompt"]
    H --> I["User confirms payment"]
    I --> J["Create settlement record<br/>Update balances<br/>Send notification"]
    F --> K["User manual entry<br/>or choose other method"]
    
    style A fill:#e1f5ff
    style E fill:#c8e6c9
    style J fill:#a5d6a7
    style F fill:#ffccbc
```

---

## 7.4 Settle Up with Vipps Flow  `P1`
Identical to Swish flow: Quits builds a vipps://send deep link, opens the app, handles fallback to web URL if app unavailable, then prompts for confirmation.

```mermaid
flowchart TD
    A["User taps<br/>Settle with Vipps"] --> B["Quits builds vipps://send URL<br/>payee_phone + amount"]
    B --> C["System opens Vipps app"]
    C --> D{Vipps<br/>installed?}
    D -->|Yes| E["User confirms payment<br/>in Vipps app"]
    D -->|No| F["Fallback: open Vipps<br/>web URL in browser"]
    E --> G["User returns to Quits"]
    F --> G2["User completes<br/>web-based payment"]
    G --> H["Show Mark as Paid prompt"]
    G2 --> H
    H --> I["User confirms payment"]
    I --> J["Create settlement record<br/>Update balances<br/>Send notification"]
    
    style A fill:#e1f5ff
    style E fill:#c8e6c9
    style J fill:#a5d6a7
    style F fill:#fff9c4
```

---

## 7.5 Settle Up with PayPal Flow  `P1`
Opens paypal.me/{user}/{amount} in browser. No in-app callback; user manually marks settlement after confirming payment outside Quits.

```mermaid
flowchart TD
    A["User taps<br/>Settle with PayPal"] --> B["Quits constructs<br/>paypal.me/username/amount"]
    B --> C["System opens URL<br/>in browser"]
    C --> D["PayPal login page<br/>or payment confirmation"]
    D --> E["User confirms payment<br/>in PayPal"]
    E --> F["User returns to Quits<br/>manually"]
    F --> G["Show Mark as Paid prompt"]
    G --> H["User confirms settlement"]
    H --> I["Create settlement record<br/>Update balances<br/>Send notification"]
    
    style A fill:#e1f5ff
    style E fill:#c8e6c9
    style G fill:#fff3e0
    style I fill:#a5d6a7
```

---

## 7.6 Partial Settlement Flow  `P1`
Amount field is editable on the settle-up screen. User can pay less than the full balance, creating a partial settlement record with remaining balance automatically updated.

```mermaid
sequenceDiagram
    participant User as User
    participant App as Quits App
    participant DB as Database
    
    User->>App: Tap "Settle up with Alice"
    App->>App: Pre-fill full balance<br/>(240 SEK)
    App->>User: Show settle screen<br/>(editable amount field)
    User->>App: Edit amount to 100 SEK<br/>(partial payment)
    User->>App: Confirm settlement
    App->>DB: Create settlement record<br/>(payer, payee, 100 SEK)
    DB->>DB: Update expense_splits
    DB->>DB: Recalculate balances<br/>Remaining: 140 SEK
    App->>App: Update balance view
    App->>User: Show confirmation<br/>Remaining: 140 SEK
```

---

## 7.7 Settlement Confirmation & Notification Flow  `P0`
After settlement is recorded, the settling user sees confirmation, the receiving user gets a push notification, and both see updated balances in real time.

```mermaid
flowchart TD
    A["Settlement recorded<br/>in database"] --> B["Settling user<br/>sees confirmation"]
    A --> C["Notification service<br/>sends push"]
    
    B --> B1["Settled badge<br/>in balance list"]
    B --> B2["Balances update<br/>live"]
    
    C --> C1["Receiving user<br/>gets push:<br/>Alice paid you 240 SEK"]
    
    C1 --> C2["User opens Quits<br/>via push tap"]
    C2 --> C3["Balances updated<br/>Settlement visible"]
    
    B2 -.->|sync| C3
    
    style A fill:#c8e6c9
    style B fill:#a5d6a7
    style C1 fill:#a5d6a7
    style B1 fill:#81c784
    style C3 fill:#81c784
```

---

## 7.8 Debt Simplification View  `P1`
Opt-in per group. Applies minimum cash flow algorithm to reduce inter-member transfers, showing simplified edges (who pays whom and amounts) vs. the raw expense splits.

```mermaid
flowchart TD
    A["User toggles<br/>Simplified View"] --> B{Algorithm<br/>enabled?}
    B -->|Yes| C["Run minimum cash<br/>flow algorithm"]
    B -->|No| D["Show raw splits<br/>from expense_splits"]
    
    C --> E["Compute consolidated<br/>transfers"]
    E --> F["Visual: simplified graph<br/>Alice → Bob: 240 SEK<br/>Bob → Charlie: 50 SEK"]
    
    D --> G["Visual: raw detail<br/>Alice pays [split1, split2]<br/>Bob pays [split3]"]
    
    F --> H["User sees reduced<br/>settlement count"]
    G --> I["User sees full<br/>transaction history"]
    
    style A fill:#e1f5ff
    style C fill:#f3e5f5
    style F fill:#e1bee7
    style H fill:#ce93d8
    style G fill:#fff3e0
    style I fill:#ffe0b2
```

---

## Summary

- **7.1**: Balance screen with "You owe" / "Owed to you" sections and optional simplified view toggle.
- **7.2**: Manual settle flow—confirm amount, mark as paid, create settlement record, notify.
- **7.3**: Swish deep-link flow—build URL, open app, handle fallback, prompt to confirm.
- **7.4**: Vipps deep-link flow—same pattern as Swish with vipps://send fallback.
- **7.5**: PayPal browser-based flow—open paypal.me, user returns and confirms manually.
- **7.6**: Partial settlement—user edits amount, remaining balance updates automatically.
- **7.7**: Confirmation & notification—settling user sees confirmation, payee gets push, balances update live.
- **7.8**: Debt simplification—opt-in minimum cash flow algorithm per group, consolidated visual vs. raw splits toggle.
