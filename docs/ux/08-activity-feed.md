# UX Diagrams — Activity Feed

## 8.1 Group Activity Feed Screen Layout  `P0`

Reverse-chronological list of activity items grouped by date, with pull-to-refresh and tap navigation to relevant details.

```mermaid
flowchart TD
    A["📱 Group Activity Feed"] --> B["🔄 Pull to Refresh"]
    A --> C["📅 Today"]
    C --> D1["👤 Alice added 'Dinner'<br/>240 SEK · 2:45 PM"]
    C --> D2["👤 Bob edited 'Groceries'<br/>1:30 PM"]
    A --> E["📅 Yesterday"]
    E --> F1["👤 Alice paid Bob<br/>500 SEK · 11:20 AM"]
    E --> F2["👤 Charlie joined<br/>the group · 9:15 AM"]
    A --> G["📅 Older"]
    G --> H1["👤 Dana left the group<br/>May 8"]
    
    D1 -->|Tap| I["Navigate to<br/>Expense Details"]
    D2 -->|Tap| I
    F1 -->|Tap| J["Navigate to<br/>Settlement Details"]
    F2 -->|Tap| K["View Group Info"]
    H1 -->|Tap| K
    
    style A fill:#e8f4f8
    style B fill:#f0f0f0
    style C fill:#f5f5f5
    style E fill:#f5f5f5
    style G fill:#f5f5f5
    style I fill:#e3f2fd
    style J fill:#e3f2fd
    style K fill:#e3f2fd
```

---

## 8.2 Global Activity Feed Screen Layout  `P0`

All activity across all groups the user belongs to, with group name badge on each item for context.

```mermaid
flowchart TD
    A["📱 Global Activity Feed"] --> B["🔄 Pull to Refresh"]
    A --> C["📅 Today"]
    C --> D1["👤 Alice added 'Dinner'<br/>🏷️ Weekend Trip · 240 SEK · 3:20 PM"]
    C --> D2["👤 Bob edited 'Fuel'<br/>🏷️ Road Trip · 2:15 PM"]
    C --> D3["👤 Charlie joined<br/>🏷️ Office Party"]
    A --> E["📅 Yesterday"]
    E --> F1["👤 Eve paid Alice<br/>🏷️ Apartment · 1,200 SEK · 4:45 PM"]
    E --> F2["👤 Frank deleted 'Snacks'<br/>🏷️ Weekend Trip · 11:00 AM"]
    A --> G["📅 Older"]
    G --> H1["👤 Grace joined<br/>🏷️ Weekend Trip · May 8"]
    
    D1 -->|Tap| I["Navigate to<br/>Expense Details"]
    D2 -->|Tap| I
    D3 -->|Tap| J["Navigate to<br/>Group / Member Info"]
    F1 -->|Tap| K["Navigate to<br/>Settlement Details"]
    F2 -->|Tap| I
    H1 -->|Tap| J
    
    style A fill:#e8f4f8
    style B fill:#f0f0f0
    style C fill:#f5f5f5
    style E fill:#f5f5f5
    style G fill:#f5f5f5
    style I fill:#e3f2fd
    style J fill:#e3f2fd
    style K fill:#e3f2fd
```

---

## 8.3 Activity Item Types Reference  `P0`

Visual and textual representation of all activity item types in the activity feed.

```mermaid
flowchart TD
    A["Activity Item Types"] 
    
    A --> B["💰 Expense Events"]
    B --> B1["✅ expense.created<br/>👤 Alice added 'Dinner' — 240 SEK<br/>⏰ Today 2:45 PM"]
    B --> B2["✏️ expense.updated<br/>👤 Bob edited 'Groceries'<br/>⏰ Today 1:30 PM"]
    B --> B3["❌ expense.deleted<br/>👤 Alice deleted 'Coffee'<br/>⏰ Today 11:00 AM"]
    
    A --> C["💳 Settlement Events"]
    C --> C1["✅ settlement.created<br/>👤 Alice paid Bob 500 SEK<br/>⏰ Yesterday 4:20 PM"]
    
    A --> D["👥 Member Events"]
    D --> D1["➕ member.joined<br/>👤 Charlie joined the group<br/>⏰ Yesterday 9:15 AM"]
    D --> D2["➖ member.left<br/>👤 Dana left the group<br/>⏰ May 8 3:30 PM"]
    
    A --> E["🏢 Group Events"]
    E --> E1["🆕 group.created<br/>👤 Alice created group 'Weekend Trip'<br/>⏰ May 5 10:00 AM"]
    
    style A fill:#e8f4f8,stroke:#0277bd,stroke-width:2px
    style B fill:#fff3e0,stroke:#ff6f00
    style C fill:#f3e5f5,stroke:#7b1fa2
    style D fill:#e8f5e9,stroke:#388e3c
    style E fill:#fce4ec,stroke:#c2185b
    style B1 fill:#fffde7,stroke:#666
    style B2 fill:#fffde7,stroke:#666
    style B3 fill:#fffde7,stroke:#666
    style C1 fill:#f3e5f5,stroke:#666
    style D1 fill:#e8f5e9,stroke:#666
    style D2 fill:#e8f5e9,stroke:#666
    style E1 fill:#fce4ec,stroke:#666
```

---

## Notes

- **Date grouping**: Activity items are grouped by calendar date (Today, Yesterday, Older) for quick scanning.
- **Avatar + Description**: Each item displays the user's avatar, action description, and formatted timestamp.
- **Tap actions**: Tapping navigates to relevant details (expense, settlement, or group info).
- **Pull-to-refresh**: Both feeds support pull-to-refresh to load new activity in real time.
- **Group context**: Global feed includes group name badge (🏷️) to identify which group each activity belongs to.
- **Activity types**: Seven primary activity types cover expenses, settlements, membership, and group creation.
