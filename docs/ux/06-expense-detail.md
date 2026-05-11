# UX Diagrams — Expense Detail & Editing

## 6.1 Expense Detail Screen Layout  `P0`

The expense detail screen displays all relevant information about a single expense, including immutable base data, visual elements, and interactive controls.

```mermaid
flowchart TD
    A["Expense Detail Screen"] --> B["Header Section"]
    A --> C["Core Details"]
    A --> D["Receipt & Attachments"]
    A --> E["Split Breakdown"]
    A --> F["Activity & Metadata"]
    A --> G["Comments Section"]
    A --> H["Action Buttons"]
    
    B --> B1["Title"]
    B --> B2["Category Tag"]
    
    C --> C1["Amount<br/>Date"]
    C --> C2["Payer Name<br/>Profile Avatar"]
    
    D --> D1["Receipt Thumbnail<br/>Tap → Lightbox"]
    
    E --> E1["Split Method<br/>Display"]
    E --> E2["Individual Splits<br/>Name + Amount<br/>Owed"]
    
    F --> F1["'Edited X times'<br/>Tap → History"]
    F --> F2["Created timestamp"]
    
    G --> G1["Comments List"]
    G --> G2["Comment Input Box<br/>Type + @mention<br/>Post Button"]
    
    H --> H1["Edit Button<br/>Author/Admin Only"]
    H --> H2["Delete Button<br/>Author/Admin Only"]
    H --> H3["Share Button"]
```

---

## 6.2 Edit Expense Flow  `P0`

When the expense author or group admin taps edit, the form pre-populates with current values, allowing modifications that create a new revision.

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Backend
    participant Group
    
    User->>App: Tap "Edit" button
    App->>App: Verify auth (author or admin)
    App->>App: Load form with current values
    User->>App: Modify expense details<br/>(amount, date, split, etc.)
    User->>App: Tap "Save Changes"
    App->>App: Validate form
    App->>Backend: POST /expenses/:id/revisions<br/>{ new_data }
    
    Backend->>Backend: Create new revision entry
    Backend->>Backend: Update expense base record
    Backend->>Backend: Log to activity stream
    Backend->>Group: Notify affected members
    Backend->>App: Return updated expense
    
    App->>App: Dismiss form
    App->>App: Show detail with updated data
    App->>User: Toast: "Expense updated"
    
    Group->>Group: Receive push notification<br/>"Expense edited by X"
```

---

## 6.3 Delete Expense Flow  `P0`

Soft-delete via long-press or menu, with confirmation showing balance impact before final deletion.

```mermaid
stateDiagram-v2
    [*] --> ViewDetail
    
    ViewDetail --> MenuOpen: Long-press or<br/>menu icon
    
    MenuOpen --> ConfirmDelete: Select<br/>"Delete Expense"
    
    ConfirmDelete --> ConfirmSheet: Show sheet with:<br/>Amount, Payer,<br/>Impact on balances
    
    ConfirmSheet --> CancelDelete: Swipe down /<br/>Cancel button
    CancelDelete --> ViewDetail: Return to detail
    
    ConfirmSheet --> SoftDelete: Tap "Delete"
    
    SoftDelete --> SetFlag: Set is_deleted = true
    SetFlag --> LogActivity: Add activity log entry<br/>"Expense deleted by X"
    LogActivity --> NotifyGroup: Send push to group<br/>"Expense removed"
    NotifyGroup --> RefreshList: Hide from expenses list
    RefreshList --> [*]
```

---

## 6.4 Expense Revision History Screen  `P0`

Timeline view of all edits to an expense, showing what changed, who changed it, and when.

```mermaid
flowchart TD
    A["Revision History<br/>Screen"] --> B["Timeline Header"]
    B --> B1["'Edited X times'"]
    
    A --> C["Revision Entries<br/>Reverse chronological"]
    
    C --> D["Revision Card"]
    D --> D1["Timestamp<br/>relative & absolute"]
    D --> D2["Editor Name<br/>+ Avatar"]
    D --> D3["Change Summary<br/>Label: What changed"]
    D --> D4["Expandable Diff<br/>Old value → New value"]
    
    C --> E["More Revisions"]
    E --> F["Original Entry"]
    F --> F1["Created by"]
    F --> F2["Initial values"]
    
    D -.->|Tap expand| D4
    D4 --> D5["Field-by-field diff<br/>Amount: $20 → $25<br/>Date: 5/1 → 5/2<br/>Split: equal → custom"]
    
    A --> G["Back Button"]
    G --> H["Return to Detail"]
```

---

## 6.5 Comment on Expense Flow  `P0`

Users type comments with optional @mentions at the bottom of the expense detail, triggering notifications to mentioned users and expense participants.

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Backend
    participant Recipients
    
    User->>App: Tap comment input box
    App->>App: Show keyboard
    User->>App: Type message
    User->>App: Type '@' to mention
    App->>App: Show @mention picker<br/>Group members list
    User->>App: Select member (optional)
    App->>App: Insert @username mention
    User->>App: Tap "Post" button
    
    App->>App: Validate comment<br/>(not empty, < char limit)
    App->>Backend: POST /expenses/:id/comments<br/>{ text, mentioned_ids }
    
    Backend->>Backend: Create comment record
    Backend->>Backend: Extract @mentions
    Backend->>Backend: Log to activity
    
    Backend->>Recipients: Send push notifications to:<br/>- Mentioned users<br/>- Expense participants<br/>"New comment by X"
    Backend->>App: Return created comment
    
    App->>App: Dismiss keyboard
    App->>App: Add comment to list
    App->>App: Scroll to new comment
    App->>User: Toast: "Comment posted"
    
    Recipients->>Recipients: Receive push alert
    Recipients->>App: Tap → Navigate to comment
```

---

## Summary

These diagrams document the complete expense detail and editing workflow:

- **6.1** shows the visual hierarchy and component structure of the detail screen
- **6.2** illustrates the immutable revision pattern: edits create new versions in the activity log
- **6.3** demonstrates the safe soft-delete flow with balance impact preview
- **6.4** displays the revision history timeline, allowing users to see edit history
- **6.5** shows the comment posting flow with @mention support and push notifications

All actions respect permissions (author/admin only for edit/delete) and maintain audit trails via the activity log.
