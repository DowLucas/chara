# UX Diagrams — Notifications

## 10.1 Push Notification Types Reference  `P0`

Reference of all notification types with their content structure.

```mermaid
graph TD
    A["Push Notification Types"] --> B["new_expense"]
    A --> C["expense_edited"]
    A --> D["settlement_received"]
    A --> E["settlement_reminder"]
    A --> F["group_invite"]
    A --> G["mention"]
    
    B --> B1["Alice added 'Dinner'<br/>in Weekend Trip (+120 SEK)"]
    C --> C1["Bob edited 'Groceries'<br/>in Flatmates"]
    D --> D1["Alice paid you 240 SEK<br/>in Weekend Trip"]
    E --> E1["You still owe Bob 180 SEK"]
    F --> F1["Dana invited you to<br/>'Beach House'"]
    G --> G1["Alice mentioned you<br/>in a comment"]
    
    style B fill:#e1f5ff
    style C fill:#f3e5f5
    style D fill:#e8f5e9
    style E fill:#fff3e0
    style F fill:#fce4ec
    style G fill:#f1f8e9
```

## 10.2 Notification Deep Link Routing Flow  `P0`

Flow from tap on push notification through app state detection and routing to the appropriate screen.

```mermaid
stateDiagram-v2
    [*] --> TapNotification: User taps<br/>push notification
    
    TapNotification --> AppState: Parse payload
    
    AppState --> Foreground: App in<br/>foreground?
    AppState --> Background: App in<br/>background?
    AppState --> ColdStart: Cold start<br/>from killed state?
    
    Foreground --> RouteType
    Background --> RouteType
    ColdStart --> RouteType
    
    RouteType --> ExpenseDetail: new_expense or<br/>expense_edited
    RouteType --> BalanceScreen: settlement_received
    RouteType --> InviteSheet: group_invite
    RouteType --> CommentSection: mention
    
    ExpenseDetail --> [*]
    BalanceScreen --> [*]
    InviteSheet --> [*]
    CommentSection --> [*]
```

## 10.3 In-App Notifications List Screen  `P1`

Screen layout showing notifications in reverse-chronological order with interaction patterns.

```mermaid
graph TD
    A["Notifications List Screen"] --> B["Header: 'Notifications'"]
    A --> C["Action: Mark all read"]
    A --> D["Notification Items<br/>Reverse-chronological"]
    A --> E["Pull to refresh"]
    
    D --> D1["Unread indicator<br/>dot on left"]
    D --> D2["Notification content<br/>Alice added Dinner..."]
    D --> D3["Timestamp<br/>2 minutes ago"]
    D --> D4["Tap → Deep link"]
    
    D1 --> D1a["Visual: blue dot"]
    D2 --> D2a["Truncated if long"]
    D3 --> D3a["Relative time"]
    D4 --> D4a["Route to relevant screen"]
    
    E --> E1["Refresh from backend"]
    C --> C1["Mark all notifications<br/>as read"]
    
    style A fill:#f5f5f5
    style B fill:#fff
    style D fill:#fff
    style E fill:#e3f2fd
```

## 10.4 Notification Preferences Screen  `P0`

Per-category toggle settings for push notifications.

```mermaid
graph TD
    A["Notification Preferences"] --> B["Settings Header"]
    B --> B1["Channel: Push Notifications"]
    
    A --> C["Preference Categories"]
    
    C --> C1["New expenses in my groups"]
    C --> C2["Expenses I'm part of<br/>get edited"]
    C --> C3["Settlements I receive"]
    C --> C4["Settlement reminders"]
    C --> C5["Group invites"]
    C --> C6["@mentions"]
    
    C1 --> T1["Toggle: ON/OFF"]
    C2 --> T2["Toggle: ON/OFF"]
    C3 --> T3["Toggle: ON/OFF"]
    C4 --> T4["Toggle: ON/OFF"]
    C5 --> T5["Toggle: ON/OFF"]
    C6 --> T6["Toggle: ON/OFF"]
    
    T1 --> S["Save immediately<br/>or on screen exit"]
    T2 --> S
    T3 --> S
    T4 --> S
    T5 --> S
    T6 --> S
    
    style A fill:#f5f5f5
    style C fill:#fff
    style C1 fill:#fff
    style C2 fill:#fff
    style C3 fill:#fff
    style C4 fill:#fff
    style C5 fill:#fff
    style C6 fill:#fff
```
