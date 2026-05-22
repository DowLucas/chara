# UX Diagrams — Add Expense

## 5.1 Add Expense Screen Layout  `P0`

The main form captures all expense details with organized sections: basic info (title, amount, currency, date), categorization, payer selection, split method, participants list, notes, and receipt attachment option.

```mermaid
flowchart TD
    A["📝 Add Expense Form"] --> B["Title Input Field"]
    A --> C["Amount + Currency<br/>Amount: Int64 minor units<br/>Currency: Picker"]
    A --> D["Date Picker<br/>Default: Today"]
    A --> E["Category Picker<br/>Food, Transport, etc."]
    A --> F["Paid By Selector<br/>Default: Current User"]
    A --> G["Split Method Picker<br/>Equal | Exact | % | Shares | Adjust"]
    A --> H["Participants List<br/>Show split breakdown"]
    A --> I["Notes Textarea<br/>Optional"]
    A --> J["Attach Receipt Button<br/>📷 Camera / Photo"]
    A --> K["Action Buttons"]
    K --> K1["💾 Save Expense"]
    K --> K2["❌ Cancel"]
    
    style A fill:#4A90E2,color:#fff
    style K fill:#f0f0f0
```

---

## 5.2 Equal Split Flow  `P0`

Default split divides the amount equally among all participants. Remainders are distributed one minor unit (öre) at a time in deterministic order by member ID to avoid rounding ambiguity.

```mermaid
flowchart TD
    A["User selects 'Equal Split'"] --> B["Expense Amount: 1000 öre"]
    B --> C["Participants: 3 people"]
    C --> D["Base per person: 1000 ÷ 3 = 333 öre"]
    D --> E["Remainder: 1 öre"]
    E --> F["Distribute by member ID order"]
    F --> G["Preview Calculation"]
    
    G --> H["Member A: 334 öre<br/>Member B: 333 öre<br/>Member C: 333 öre<br/>Total: 1000 öre ✓"]
    
    H --> I{"Confirm<br/>split?"}
    I -->|Yes| J["✅ Save split"]
    I -->|No| K["Adjust participants<br/>or amount"]
    
    style A fill:#4A90E2,color:#fff
    style G fill:#FFF4E6
    style J fill:#7ED321,color:#fff
```

---

## 5.3 Exact Amount Split Flow  `P0`

Each participant receives a specific amount input. A running total shows the sum of all entered amounts. Save button is disabled until the total exactly matches the expense amount.

```mermaid
flowchart TD
    A["User selects 'Exact Amount'"] --> B["Expense Total: 1000 öre"]
    B --> C["Input fields for each participant"]
    
    C --> D["Member A: [input]"]
    D --> E["Member B: [input]"]
    E --> F["Member C: [input]"]
    
    F --> G["Running Total Display"]
    G --> H["Sum entered amounts"]
    
    H --> I{"Total == 1000?"}
    I -->|No| J["⚠️ Running Total: 850 öre<br/>Remaining: 150 öre<br/>Save button: DISABLED"]
    J --> K["User adjusts inputs"]
    K --> H
    
    I -->|Yes| L["✅ Running Total: 1000 öre<br/>Perfect match!<br/>Save button: ENABLED"]
    L --> M["User saves"]
    
    style B fill:#4A90E2,color:#fff
    style J fill:#FF6B6B,color:#fff
    style L fill:#7ED321,color:#fff
```

---

## 5.4 Percentage Split Flow  `P0`

Each participant is assigned a percentage of the total expense. The percentages must sum to exactly 100%. A running total shows the current sum.

```mermaid
flowchart TD
    A["User selects 'Percentage'"] --> B["Expense Total: 1000 öre"]
    B --> C["Input % for each participant"]
    
    C --> D["Member A: [50]%"]
    D --> E["Member B: [30]%"]
    E --> F["Member C: [20]%"]
    
    F --> G["Running Total Display"]
    G --> H["Sum percentages"]
    
    H --> I{"Sum == 100%?"}
    I -->|No| J["⚠️ Current Total: 95%<br/>Error: Must equal 100%<br/>Save button: DISABLED"]
    J --> K["User adjusts percentages"]
    K --> H
    
    I -->|Yes| L["✅ Total: 100%<br/>Calculated amounts:<br/>A: 500 öre (50%)<br/>B: 300 öre (30%)<br/>C: 200 öre (20%)<br/>Save button: ENABLED"]
    L --> M["User saves"]
    
    style B fill:#4A90E2,color:#fff
    style J fill:#FF6B6B,color:#fff
    style L fill:#7ED321,color:#fff
```

---

## 5.5 Share-Based Split Flow  `P1`

Each participant is assigned a share count (e.g., 2 shares, 1 share). The amount is distributed proportionally based on share counts. A participant with 2 shares receives twice as much as one with 1 share.

```mermaid
flowchart TD
    A["User selects 'Shares'"] --> B["Expense Total: 1000 öre"]
    B --> C["Assign share counts"]
    
    C --> D["Member A: [2] shares"]
    D --> E["Member B: [1] share"]
    E --> F["Member C: [1] share"]
    
    F --> G["Total Shares: 4"]
    G --> H["Per share: 1000 ÷ 4 = 250 öre"]
    
    H --> I["Calculate allocations"]
    I --> J["Member A: 2 × 250 = 500 öre<br/>Member B: 1 × 250 = 250 öre<br/>Member C: 1 × 250 = 250 öre<br/>Total: 1000 öre ✓"]
    
    J --> K{"Accept<br/>split?"}
    K -->|Yes| L["✅ Save split"]
    K -->|No| M["Adjust share counts"]
    M --> G
    
    style A fill:#4A90E2,color:#fff
    style J fill:#FFF4E6
    style L fill:#7ED321,color:#fff
```

---

## 5.6 Adjustment Split Flow  `P1`

Starts with an equal split as the baseline, then allows per-participant adjustments (± öre). A running net column shows each person's final amount after adjustments are applied.

```mermaid
flowchart TD
    A["User selects 'Adjustments'"] --> B["Expense Total: 1000 öre"]
    B --> C["3 participants"]
    C --> D["Base Equal Split"]
    D --> E["Member A: 334 öre<br/>Member B: 333 öre<br/>Member C: 333 öre"]
    
    E --> F["Adjust each participant"]
    F --> G["Member A: +50 öre"]
    G --> H["Member B: -25 öre"]
    H --> I["Member C: -25 öre"]
    
    I --> J["Calculate net amounts"]
    J --> K["Running Net Display"]
    K --> L["Member A: 334 + 50 = 384 öre<br/>Member B: 333 - 25 = 308 öre<br/>Member C: 333 - 25 = 308 öre<br/>Total: 1000 öre ✓"]
    
    L --> M{"Confirm<br/>adjustments?"}
    M -->|Yes| N["✅ Save adjusted split"]
    M -->|No| O["Modify adjustments"]
    O --> F
    
    style A fill:#4A90E2,color:#fff
    style K fill:#FFF4E6
    style N fill:#7ED321,color:#fff
```

---

## 5.7 Attach Receipt Photo Flow  `P0`

User taps the attachment button to trigger a photo picker or camera. Selected image is uploaded to S3 in background with progress indication. Thumbnail displayed once upload completes.

```mermaid
stateDiagram-v2
    [*] --> Ready
    
    Ready: "Attach Receipt"
    Ready --> Picker: Tap camera icon
    
    Picker: "System Photo Picker/Camera"
    Picker --> Selected: Image selected
    
    Selected: "Image chosen<br/>Show thumbnail"
    Selected --> Uploading: Begin S3 upload
    
    Uploading: "⏳ Uploading...<br/>Progress: 45%"
    Uploading --> Uploading: Upload progress
    
    Uploading --> Complete: Upload complete
    
    Complete: "✅ Receipt attached<br/>Thumbnail displayed<br/>OCR button available"
    
    Complete --> Ready: Remove & choose different
    Complete --> Next: Continue form
    
    note right of Uploading
        Background upload
        to S3 with progress
        indicator visible
    end note
    
    note right of Complete
        User can now:
        - Tap "Scan receipt" for OCR
        - Continue filling form
        - Remove and retry
    end note
```

---

## 5.8 Receipt OCR Auto-Fill Flow  `P1`

Cloud tier only. After photo attachment, user can tap "Scan receipt?" prompt. Gemini Flash OCR processes the image and pre-fills amount, title, and date fields. User reviews and confirms or edits as needed.

```mermaid
sequenceDiagram
    participant User as User
    participant UI as Add Expense UI
    participant Cloud as Gemini Flash OCR
    participant S3 as S3 Storage
    
    User->>UI: Attach receipt photo
    UI->>S3: Upload image
    S3-->>UI: Upload complete
    
    User->>UI: Tap "Scan receipt?"
    UI->>UI: Show loading spinner
    UI->>Cloud: Send S3 image URL
    Cloud->>Cloud: OCR processing
    
    Cloud-->>UI: Return extracted data:<br/>amount, title, date
    UI->>UI: Pre-fill form fields
    
    UI-->>User: Show extracted values<br/>for confirmation
    User->>UI: Review & adjust if needed
    User->>UI: Confirm pre-filled data
    UI->>UI: Lock in auto-filled values
```

---

## 5.9 Per-Expense Currency Selection  `P0`

Currency picker is available on the form. Group default is shown prominently as the recommended option. Note: v1 has no FX conversion; amounts are just stored and displayed in the selected currency.

```mermaid
flowchart TD
    A["Amount + Currency Section"] --> B["Display Group Default<br/>📌 Recommended: SEK"]
    B --> C["User taps Currency Picker"]
    C --> D["Currency Options List"]
    D --> E["SEK<br/>EUR<br/>USD<br/>GBP<br/>...other currencies"]
    
    E --> F{"Select<br/>currency?"}
    F -->|Group Default SEK| G["✅ SEK selected<br/>No FX conversion applied<br/>v1: Display only"]
    F -->|Different Currency| H["⚠️ Selected: EUR<br/>Note: No FX conversion in v1<br/>Amounts stored in EUR"]
    
    G --> I["Continue form"]
    H --> I
    
    note right of H
        Future: v2+ will add
        FX conversion at group
        settlement time
    end note
    
    style B fill:#FFF4E6
    style G fill:#7ED321,color:#fff
```

---

## 5.10 Select Payer (Not Yourself) Flow  `P0`

Default payer is the current user. Tapping the "Paid by" selector opens a bottom sheet showing group members. User can select a different payer from the list.

```mermaid
stateDiagram-v2
    [*] --> DefaultPayer
    
    DefaultPayer: "Paid by: You<br/>(Current User)"
    DefaultPayer --> Tap: Tap "Paid by"
    
    Tap: "Open Payer Selector"
    Tap --> Sheet: Bottom sheet appears
    
    Sheet: "Group Members List<br/>━━━━━━━━━━━━━━━<br/>👤 You (Current)<br/>👤 Alice<br/>👤 Bob<br/>👤 Carol"
    
    Sheet --> SelectOther: Tap another member
    
    SelectOther: "Payer changed"
    SelectOther --> Updated: "Paid by: Alice"
    
    Updated --> Sheet2: Can tap to change again
    Sheet2 --> Sheet
    
    Updated --> Continue: Continue form
    
    note right of Updated
        Split calculations will
        use new payer for
        ledger tracking
    end note
```

---

## 5.11 Add Expense from iOS Share Sheet  `P1`

User selects a receipt photo in Photos app, taps Share, finds Chara in the share sheet, opens Add Expense with the image pre-attached. OCR is automatically triggered on attachment without user prompt.

```mermaid
sequenceDiagram
    participant Photos as Photos App
    participant ShareSheet as iOS Share Sheet
    participant Chara as Chara App
    participant OCR as Gemini Flash OCR
    
    Photos->>Photos: User selects receipt image
    Photos->>ShareSheet: Tap Share
    ShareSheet-->>Chara: Chara available in sheet
    
    User->>ShareSheet: Tap "Chara"
    ShareSheet->>Chara: Pass image via App Link/Share Extension
    
    Chara->>Chara: Open Add Expense screen
    Chara->>Chara: Attach image directly
    Chara->>Chara: ⏳ Auto-trigger OCR
    
    Chara->>OCR: Send image for processing
    OCR-->>Chara: Return amount, title, date
    
    Chara-->>Photos: Return to Photos (if needed)
    Chara->>User: Show pre-filled Add Expense form
    User->>Chara: Confirm or edit OCR results
```

---

## 5.12 Recurring Expense Setup Flow  `P1`

User can toggle "Repeat this expense" to set up a recurring transaction. A frequency picker offers weekly, monthly, or custom intervals. Start and end dates can be configured.

```mermaid
flowchart TD
    A["Expense Form"] --> B["Toggle: Repeat this expense"]
    B --> C{"Repeat<br/>enabled?"}
    
    C -->|No| D["One-time expense"]
    C -->|Yes| E["Frequency Picker"]
    
    E --> F["Options:<br/>Weekly<br/>Monthly<br/>Custom"]
    
    F --> G{"Select<br/>frequency"}
    G -->|Weekly| H["Repeats every: [1] week"]
    G -->|Monthly| I["Repeats every: [1] month"]
    G -->|Custom| J["Repeats every: [X] days/weeks/months"]
    
    H --> K["Start Date: [Today]"]
    I --> K
    J --> K
    
    K --> L["End Date (optional):<br/>None / Specific date"]
    L --> M["Preview Schedule"]
    M --> N["Will repeat on:<br/>May 18, May 25, Jun 1, ..."]
    
    N --> O{"Confirm<br/>schedule?"}
    O -->|Yes| P["✅ Create recurring"]
    O -->|No| Q["Adjust frequency/dates"]
    Q --> F
    
    D --> S["Save expense"]
    P --> S
    
    style B fill:#4A90E2,color:#fff
    style N fill:#FFF4E6
```

---

## 5.13 Expense Validation and Error States  `P0`

State diagram showing all validation paths, error conditions, and recovery flows. Covers zero amount, mismatched splits, no participants, future dates, and duplicate detection.

```mermaid
stateDiagram-v2
    [*] --> FormOpen
    
    FormOpen: "Add Expense Form Open"
    FormOpen --> InputValidation: User inputs data
    
    InputValidation: "Validate all fields"
    
    InputValidation --> AmountCheck: Amount > 0?
    AmountCheck -->|No| AmountError
    AmountCheck -->|Yes| SplitCheck
    
    AmountError: "❌ Error: Amount required<br/>Must be > 0<br/>Save disabled"
    AmountError --> InputValidation: User corrects amount
    
    SplitCheck: "Splits add up correctly?<br/>(depends on split method)"
    
    SplitCheck -->|Equal| EqualOK: Auto-correct remainders
    SplitCheck -->|Exact| ExactCheck
    SplitCheck -->|Percent| PercentCheck
    SplitCheck -->|Shares| SharesOK: Proportional calc valid
    SplitCheck -->|Adjust| AdjustOK: Net amounts correct
    
    ExactCheck: "Sum == Total?"
    ExactCheck -->|No| SplitError
    ExactCheck -->|Yes| ParticipantCheck
    
    PercentCheck: "Sum == 100%?"
    PercentCheck -->|No| SplitError
    PercentCheck -->|Yes| ParticipantCheck
    
    SplitError: "❌ Error: Splits don't match<br/>Shows required adjustment<br/>Save disabled"
    SplitError --> InputValidation: User adjusts splits
    
    EqualOK --> ParticipantCheck
    SharesOK --> ParticipantCheck
    AdjustOK --> ParticipantCheck
    
    ParticipantCheck: "At least 1 participant<br/>included in split?"
    ParticipantCheck -->|No| ParticipantError
    ParticipantCheck -->|Yes| DateCheck
    
    ParticipantError: "❌ Error: No participants<br/>selected for split<br/>Save disabled"
    ParticipantError --> InputValidation: User adds participants
    
    DateCheck: "Date in future?"
    DateCheck -->|Yes| FutureWarning
    DateCheck -->|No| DuplicateCheck
    
    FutureWarning: "⚠️ Warning: Expense date<br/>is in the future<br/>Allow proceed? Yes/No"
    FutureWarning -->|No| InputValidation: User changes date
    FutureWarning -->|Yes| DuplicateCheck
    
    DuplicateCheck: "Similar expense exists?<br/>(same amount, date, payer)"
    DuplicateCheck -->|Yes| DuplicateWarning
    DuplicateCheck -->|No| Ready
    
    DuplicateWarning: "⚠️ Warning: Similar expense<br/>found on [date]<br/>Continue? Yes/No"
    DuplicateWarning -->|No| InputValidation: User reviews
    DuplicateWarning -->|Yes| Ready
    
    Ready: "✅ All validations pass<br/>Save button: ENABLED"
    Ready --> Saving: User taps Save
    
    Saving: "💾 Saving expense..."
    Saving --> [*]
    
    note right of AmountError
        Prevents $0 splits
    end note
    
    note right of SplitError
        Exact and % must
        match precisely
    end note
    
    note right of FutureWarning
        Allows backdating
        but warns user
    end note
```

---

## Legend

- **öre**: Swedish currency minor unit (1 SEK = 100 öre). Used internally for all amount storage and calculations to avoid floating-point precision issues.
- **Split Methods**: 
  - **Equal**: Auto-divide with deterministic remainder distribution
  - **Exact**: User specifies per-person amount
  - **Percentage**: User specifies per-person percentage
  - **Shares**: User specifies per-person share count (P1 - planned phase)
  - **Adjustments**: User adjusts equal split baseline per person (P1 - planned phase)
- **OCR**: Optical Character Recognition. Cloud tier only, powered by Gemini Flash.
- **S3**: AWS S3 bucket for receipt photo storage.
- **Payer**: The person who paid the full expense amount. Always included in the split by default.
- **Running Total**: Real-time sum display (in Exact/Percent/Adjustments flows) showing whether splits are valid.
- **Validation**: All error states prevent saving until resolved. Warnings (future date, duplicates) allow user to proceed after confirmation.
