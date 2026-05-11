# UX Diagrams — Home Screen

## 3.1 Home Screen Layout (Populated)  `P0`

Screen structure showing total balance summary, groups list with per-group balances, recent activity, and action button for adding expenses.

```mermaid
flowchart TD
    A["📱 Home Screen"]
    
    A --> B["Header"]
    A --> C["Total Balance Card"]
    A --> D["Groups List"]
    A --> E["Recent Activity Strip"]
    A --> F["FAB + Add Expense"]
    
    C --> C1["You Owe: 1200 SEK<br/>You Are Owed: 340 SEK<br/>Net: -860 SEK"]
    C --> C2["Tap → Friends Balance Screen"]
    
    D --> D1["Group 1: Vacation<br/>You Owe: 800 SEK"]
    D --> D2["Group 2: Dinner<br/>You Owe: 400 SEK"]
    D --> D3["Group 3: Rent<br/>You Are Owed: 340 SEK"]
    
    D1 --> D1T["Tap → Group Details"]
    D2 --> D2T["Tap → Group Details"]
    D3 --> D3T["Tap → Group Details"]
    
    E --> E1["Activity Item 1<br/>Alice added expense"]
    E --> E2["Activity Item 2<br/>Bob settled up"]
    E --> E3["...More →"]
    
    E1 --> E1T["Tap → Expense Detail"]
    E2 --> E2T["Tap → Settlement Detail"]
    E3 --> E3T["Tap → Activity Feed"]
    
    F --> F1["Tap → Add Expense Modal"]
    
    style A fill:#f9f9f9
    style C fill:#e8f5e9
    style D fill:#f3e5f5
    style E fill:#fff3e0
    style F fill:#bbdefb
```

---

## 3.2 Home Screen Layout (Empty State)  `P0`

Screen shown on first app launch with no groups created, featuring empty state illustration and two primary CTAs.

```mermaid
flowchart TD
    A["📱 Home Screen<br/>Empty State"]
    
    A --> B["Empty State Illustration"]
    B --> B1["👥 No Groups Yet<br/>Visual: empty wallet icon"]
    
    A --> C["Call-to-Action Section"]
    
    C --> C1["Primary: Create Group<br/>Button: 'Start a New Group'"]
    C1 --> C1T["Tap → New Group Flow<br/>(name, members, settings)"]
    
    C --> C2["Secondary: Import Existing<br/>Button: 'Import from Splitwise'"]
    C2 --> C2T["Tap → OAuth Connect<br/>Splitwise → Pull Groups & Balances"]
    
    A --> D["Bottom Navigation"]
    D --> D1["Home - Active"]
    D --> D2["Groups"]
    D --> D3["Friends"]
    D --> D4["Settings"]
    
    style A fill:#f9f9f9
    style B1 fill:#f5f5f5
    style C fill:#e3f2fd
    style C1 fill:#90caf9
    style C2 fill:#90caf9
```

---

## 3.3 Cross-Group Balance Summary Component  `P0`

Aggregated balance card showing totals across all groups with drill-down capability to view per-group breakdown.

```mermaid
flowchart TD
    A["Balance Summary Card"]
    
    A --> A1["Display Mode: Overview"]
    A1 --> A1a["You Owe: 1200 SEK<br/>(across 2 groups)"]
    A1 --> A1b["You Are Owed: 340 SEK<br/>(across 1 group)"]
    A1 --> A1c["Net Balance: -860 SEK<br/>⚠️ (You owe money)"]
    
    A --> A2["Tap Card → Drill-Down"]
    
    A2 --> A3["Drill-Down View: Per-Group Breakdown"]
    A3 --> A3a["Alice"]
    A3 --> A3b["You Owe Alice<br/>- 240 SEK in Vacation<br/>- 160 SEK in Dinner<br/>- 200 SEK in Hike<br/>Total: 600 SEK"]
    
    A3a --> A3aT["Tap → Settlement Options<br/>(Pay Alice, Request Money)"]
    
    A3 --> A3c["Bob"]
    A3 --> A3d["Bob Owes You<br/>+ 340 SEK in Rent<br/>Total: 340 SEK"]
    
    A3c --> A3cT["Tap → Settlement Options<br/>(Remind Bob, Record Payment)"]
    
    A --> A4["Color Coding"]
    A4 --> A4a["Red/Negative: You Owe"]
    A4 --> A4b["Green/Positive: You Are Owed"]
    A4 --> A4c["Gray: Settled"]
    
    style A fill:#e8f5e9
    style A2 fill:#fff3e0
    style A3 fill:#f3e5f5
    style A3b fill:#ffcdd2
    style A3d fill:#c8e6c9
```

---

## 3.4 Friends Balance List Screen  `P0`

Person-centric view of all users the app user shares expenses with, sorted by outstanding balance (both positive and negative).

```mermaid
flowchart TD
    A["👥 Friends Screen"]
    
    A --> A1["Header: Friends"]
    A --> A2["Search Bar"]
    A2 --> A2T["Filter by name"]
    
    A --> A3["Sort Options"]
    A3 --> A3a["By Balance (Default)"]
    A3 --> A3b["By Name"]
    A3 --> A3c["By Shared Groups"]
    
    A --> A4["Friends List"]
    
    A4 --> A4a["Section: You Owe"]
    A4a --> A4a1["Alice | -600 SEK<br/>Shared: 3 groups"]
    A4a --> A4a2["Charlie | -300 SEK<br/>Shared: 1 group"]
    
    A4a1 --> A4a1T["Tap → Settlement Flow<br/>Pay Alice / Request"]
    A4a2 --> A4a2T["Tap → Settlement Flow<br/>Pay Charlie / Request"]
    
    A4 --> A4b["Section: You Are Owed"]
    A4b --> A4b1["Bob | +340 SEK<br/>Shared: 1 group"]
    A4b --> A4b2["Diana | +120 SEK<br/>Shared: 2 groups"]
    
    A4b1 --> A4b1T["Tap → Settlement Flow<br/>Remind Bob / Record Payment"]
    A4b2 --> A4b2T["Tap → Settlement Flow<br/>Remind Diana / Record Payment"]
    
    A4 --> A4c["Section: Settled"]
    A4c --> A4c1["Eve | ±0 SEK<br/>Shared: 2 groups"]
    
    A --> A5["Bottom Navigation"]
    A5 --> A5a["Home"]
    A5 --> A5b["Groups"]
    A5 --> A5c["Friends - Active"]
    A5 --> A5d["Settings"]
    
    style A fill:#f9f9f9
    style A4a fill:#ffcdd2
    style A4b fill:#c8e6c9
    style A4c fill:#eeeeee
    style A4a1T fill:#ef5350
    style A4b1T fill:#66bb6a
```

---

## Component Interaction Map

```mermaid
flowchart LR
    Home["Home Screen<br/>(Populated)"]
    Empty["Empty State<br/>(No Groups)"]
    Balance["Balance Summary<br/>Card"]
    Friends["Friends List<br/>Screen"]
    GroupDtl["Group Details"]
    Settlement["Settlement<br/>Flow"]
    AddExp["Add Expense<br/>Modal"]
    ActivityFeed["Activity Feed"]
    
    Home -->|"Tap balance card"| Balance
    Balance -->|"Tap person"| Settlement
    
    Home -->|"Tap group"| GroupDtl
    Home -->|"Tap FAB"| AddExp
    Home -->|"Tap 'More'"| ActivityFeed
    
    Home -->|"Bottom nav"| Friends
    Friends -->|"Tap friend"| Settlement
    
    Empty -->|"Create Group"| Home
    Empty -->|"Import Splitwise"| Home
    
    style Home fill:#e8f5e9
    style Empty fill:#f5f5f5
    style Balance fill:#fff3e0
    style Friends fill:#e3f2fd
    style Settlement fill:#f3e5f5
    style AddExp fill:#bbdefb
```

