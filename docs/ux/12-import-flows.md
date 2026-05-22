# UX Diagrams — Import Flows

## 12.1 Splitwise Import Flow  `P0`

User selects Splitwise as import source and chooses between OAuth login or CSV upload, leading to parsing, preview, confirmation, and background job processing with push notification.

```mermaid
flowchart TD
    A["Profile → Import"] --> B["Select: Splitwise"]
    B --> C{Import Method}
    C -->|OAuth Login| D["Login to Splitwise API"]
    C -->|CSV Upload| E["Upload CSV File"]
    D --> F["Fetch & Parse Splitwise Data"]
    E --> F
    F --> G["Preview Screen"]
    G --> G1["Show: X Groups<br/>Y Expenses<br/>Z Friends"]
    G1 --> H{Confirm Import?}
    H -->|Cancel| I["Return to Profile"]
    H -->|Confirm| J["Queue River Background Job"]
    J --> K["Processing..."]
    K --> L["Push Notification:<br/>Import Complete"]
    L --> M["Navigate to Imported Groups"]
    M --> N["Done"]
```

---

## 12.2 Steven Import Flow  `P1`

User uploads a Steven export file, which is parsed and displayed in a preview screen with merge/create options, followed by confirmation and background processing with status indication.

```mermaid
flowchart TD
    A["Profile → Import"] --> B["Select: Steven"]
    B --> C["Upload Steven Export File"]
    C --> D["Parse Steven Data"]
    D --> E["Preview Screen"]
    E --> E1["Show: Groups to Import<br/>Expenses Count<br/>Participants"]
    E1 --> F{Merge or Create?}
    F -->|Merge into Existing| G["Select Target Group"]
    F -->|Create New| H["New Group Name"]
    G --> I{Confirm Import?}
    H --> I
    I -->|Cancel| J["Return to Profile"]
    I -->|Confirm| K["Queue River Background Job"]
    K --> L["Pending State:<br/>Progress Bar"]
    L --> M["Processing Complete"]
    M --> N["Push Notification"]
    N --> O["View Imported Data"]
```

---

## 12.3 CSV Generic Import Flow  `P1`

User uploads a generic CSV file, maps columns to Chara fields via drag-and-select UI, previews the first 5 rows, confirms, and imports with background processing.

```mermaid
flowchart TD
    A["Profile → Import"] --> B["Select: CSV Upload"]
    B --> C["Upload CSV File"]
    C --> D["Column Mapping Screen"]
    D --> E["Drag/Select to Map:<br/>Date, Title, Amount<br/>Currency, Payer, Participants"]
    E --> F{Mapping Valid?}
    F -->|No| G["Show Error:<br/>Required Fields Missing"]
    G --> E
    F -->|Yes| H["Preview: First 5 Rows"]
    H --> I["Table with Mapped Data"]
    I --> J{Confirm Import?}
    J -->|Cancel| K["Return to Profile"]
    J -->|Edit Mapping| E
    J -->|Confirm| L["Queue River Background Job"]
    L --> M["Processing..."]
    M --> N["Import Complete"]
    N --> O["View Imported Data"]
```

---

## 12.4 Import Review & Conflict Resolution Screen  `P0`

Comprehensive review screen showing group handling options, duplicate detection with skip/import choice, user mapping for unknowns, currency conflict resolution, and error summary with progress bar during processing.

```mermaid
flowchart TD
    A["Import Review Screen"] --> B["Section 1: Groups"]
    B --> B1["Group Card List"]
    B1 --> B2{Action}
    B2 -->|Merge into Existing| B3["Select Target Group"]
    B2 -->|Create New| B4["Enter Group Name"]
    B3 --> C["Section 2: Duplicates"]
    B4 --> C
    C --> C1["Duplicate Detection:<br/>Date + Amount + Title Match"]
    C1 --> C2{Each Duplicate}
    C2 -->|Skip| C3["Mark as Duplicate"]
    C2 -->|Import Anyway| C4["Override"]
    C3 --> D["Section 3: Unknown Users"]
    C4 --> D
    D --> D1["Unknown Participants"]
    D1 --> D2{Action}
    D2 -->|Create Ghost User| D3["Auto-create Unlinked User"]
    D2 -->|Map to Existing| D4["Select User from Chara"]
    D3 --> E["Section 4: Currency"]
    D4 --> E
    E --> E1["Currency Mismatch List"]
    E1 --> E2{Action}
    E2 -->|Keep Original| E3["No Conversion"]
    E2 -->|Convert| E4["Select Target Currency"]
    E3 --> F["Review Complete"]
    E4 --> F
    F --> G{Confirm All?}
    G -->|Cancel| H["Return & Edit"]
    G -->|Confirm| I["Start Import Job"]
    H --> A
    I --> J["Progress Bar"]
    J --> K["Processing..."]
    K --> L["Error Summary Panel<br/>if Errors"]
    L --> M["Import Complete"]
    M --> N["Dismiss & View Data"]
```

---

## Import Flow — Status & Notifications

Summary of push notification behavior and user navigation after import completion.

```mermaid
sequenceDiagram
    actor User
    participant Chara
    participant River as River Job Queue
    participant PushSvc as Push Service

    User ->> Chara: Confirm Import
    Chara ->> River: Queue Background Job
    Chara ->> User: Show "Importing..." State
    River ->> River: Process Expenses & Groups
    River ->> River: Detect & Handle Conflicts
    River -->> Chara: Import Complete Status
    Chara ->> PushSvc: Send Notification
    PushSvc ->> User: Push: "Import Complete"
    User ->> Chara: Tap Notification / Navigate
    Chara ->> User: Show Imported Groups List
```
