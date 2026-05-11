# UX Diagrams — Profile & Account

## 11.1 Profile Screen Layout  `P0`
The profile screen displays user identity, payment methods, account connections, preferences, and data management options in distinct sections.

```mermaid
flowchart TD
    A["Profile Screen"]
    A --> B["Header Section"]
    B --> B1["Avatar + Display Name"]
    B --> B2["Tap to Edit Profile"]
    
    A --> C["Payment Methods"]
    C --> C1["Swish Phone"]
    C --> C2["Vipps Number"]
    C --> C3["PayPal.me Link"]
    C --> C4["Tap to Edit"]
    
    A --> D["Linked Accounts"]
    D --> D1["Google OAuth"]
    D --> D2["GitHub OAuth"]
    D --> D3["Apple OAuth"]
    D --> D4["Passkeys"]
    D --> D5["Manage Connections"]
    
    A --> E["Preferences"]
    E --> E1["Language & Locale"]
    E --> E2["Notifications"]
    E --> E3["Tap to Configure"]
    
    A --> F["Data Management"]
    F --> F1["Export My Data"]
    F --> F2["View Data Access"]
    
    A --> G["Danger Zone"]
    G --> G1["Sign Out"]
    G --> G2["Delete Account"]
```

## 11.2 Edit Profile Flow  `P0`
User taps edit to modify display name, avatar, Swish/Vipps/PayPal contact info, and default currency before saving changes.

```mermaid
flowchart TD
    Start["Profile Screen"] -->|Tap Edit| Form["Edit Profile Form"]
    
    Form --> Fields["Form Fields"]
    Fields --> F1["Display Name"]
    Fields --> F2["Avatar"]
    Fields --> F3["Swish Phone"]
    Fields --> F4["Vipps Number"]
    Fields --> F5["PayPal.me Link"]
    Fields --> F6["Default Currency"]
    
    F2 -->|Tap Avatar| AvatarChoices["Choose Avatar Source"]
    AvatarChoices --> A1["Take Photo"]
    AvatarChoices --> A2["Choose from Library"]
    AvatarChoices --> A3["Remove Avatar"]
    
    A1 --> CropResize["Crop & Resize"]
    A2 --> CropResize
    CropResize --> F2
    A3 --> F2
    
    F1 --> Validate["Validate Input"]
    F3 --> Validate
    F4 --> Validate
    F5 --> Validate
    F6 --> Validate
    
    Validate -->|Valid| Save["Tap Save"]
    Validate -->|Invalid| Error["Show Error"]
    Error --> Fields
    
    Save --> Update["Update Profile"]
    Update --> Success["Profile Updated"]
    Success --> End["Return to Profile Screen"]
```

## 11.3 Payment Method Setup Flow  `P0`
User enters their Swish phone (Swedish format +46XXXXXXXXX), Vipps number, and PayPal.me link which other users reference when settling up.

```mermaid
flowchart TD
    Start["Edit Profile"] --> PaymentSection["Payment Methods Section"]
    
    PaymentSection --> SwishSetup["Swish Phone"]
    SwishSetup --> SwishInput["Enter Phone Number"]
    SwishInput --> SwishValidate["Validate Swedish Format"]
    SwishValidate -->|Valid +46XXXXXXXXX| SwishSaved["✓ Saved"]
    SwishValidate -->|Invalid| SwishError["❌ Format Error"]
    SwishError --> SwishInput
    
    PaymentSection --> VippsSetup["Vipps Number"]
    VippsSetup --> VippsInput["Enter Vipps ID"]
    VippsInput --> VippsSaved["✓ Saved"]
    
    PaymentSection --> PayPalSetup["PayPal.me Link"]
    PayPalSetup --> PayPalInput["Enter PayPal.me Username"]
    PayPalInput --> PayPalSaved["✓ Saved"]
    
    SwishSaved --> OthersView["Other Users Can See"]
    VippsSaved --> OthersView
    PayPalSaved --> OthersView
    OthersView --> SettleUp["When Settling Up"]
    SettleUp --> End["Pre-fill Payment Methods"]
```

## 11.4 Language and Locale Settings Screen  `P0`
User selects language, currency format, date format, and first day of week preferences.

```mermaid
flowchart TD
    Start["Preferences"] --> LocaleSection["Language & Locale"]
    
    LocaleSection --> LanguagePicker["Language"]
    LanguagePicker --> L1["Swedish"]
    LanguagePicker --> L2["English"]
    LanguagePicker --> L3["Norwegian Bokmål"]
    LanguagePicker --> L4["Danish"]
    LanguagePicker --> L5["Finnish"]
    LanguagePicker --> L6["German"]
    LanguagePicker --> L7["French"]
    LanguagePicker --> L8["Spanish"]
    
    LocaleSection --> CurrencyFormat["Currency Display"]
    CurrencyFormat --> C1["Format: 1,234.56 USD"]
    CurrencyFormat --> C2["Format: USD 1.234,56"]
    CurrencyFormat --> C3["Custom: Select Symbol/Position"]
    
    LocaleSection --> DateFormat["Date Format"]
    DateFormat --> D1["DD/MM/YYYY"]
    DateFormat --> D2["MM/DD/YYYY"]
    DateFormat --> D3["YYYY-MM-DD"]
    
    LocaleSection --> FirstDay["First Day of Week"]
    FirstDay --> FD1["Monday"]
    FirstDay --> FD2["Sunday"]
    
    L1 --> ApplyChanges["Apply Changes"]
    L2 --> ApplyChanges
    L3 --> ApplyChanges
    L4 --> ApplyChanges
    L5 --> ApplyChanges
    L6 --> ApplyChanges
    L7 --> ApplyChanges
    L8 --> ApplyChanges
    C1 --> ApplyChanges
    C2 --> ApplyChanges
    C3 --> ApplyChanges
    D1 --> ApplyChanges
    D2 --> ApplyChanges
    D3 --> ApplyChanges
    FD1 --> ApplyChanges
    FD2 --> ApplyChanges
    
    ApplyChanges --> Saved["Settings Saved"]
    Saved --> Preview["Preview on Screen"]
    Preview --> End["Return to Profile"]
```

## 11.5 Connected Accounts Screen  `P1`
User manages OAuth providers (Google, GitHub, Apple) and passkeys with ability to link new providers or remove existing connections.

```mermaid
flowchart TD
    Start["Linked Accounts"] --> AccountList["Connected Accounts List"]
    
    AccountList --> Google["Google OAuth"]
    Google --> GStatus["✓ Connected"]
    GStatus --> GOptions["Tap for Options"]
    GOptions --> GRemove["Remove Connection"]
    
    AccountList --> GitHub["GitHub OAuth"]
    GitHub --> GitStatus["✓ Connected"]
    GitStatus --> GitOptions["Tap for Options"]
    GitOptions --> GitRemove["Remove Connection"]
    
    AccountList --> Apple["Apple OAuth"]
    Apple --> AppleStatus["⊘ Not Connected"]
    AppleStatus --> AppleLink["Add Connection"]
    
    AccountList --> Passkeys["Passkeys"]
    Passkeys --> PKList["List Passkeys"]
    PKList --> PKAdd["Add New Passkey"]
    PKList --> PKManage["Manage Existing"]
    PKManage --> PKDelete["Delete Passkey"]
    
    GRemove -->|Only Auth Method| Warning["⚠️ Cannot Remove"]
    Warning --> KeepAuth["Must have another auth method"]
    GRemove -->|Multiple Methods| Confirm["Confirm Removal"]
    Confirm --> RemovedOAuth["Connection Removed"]
    
    GitRemove --> Confirm
    AppleLink --> OAuthFlow["OAuth Flow"]
    OAuthFlow --> LinkedNew["New Account Linked"]
    
    PKAdd --> PKSetup["Create Passkey"]
    PKSetup --> PKNamed["Name Passkey"]
    PKNamed --> PKCreated["Passkey Saved"]
    
    RemovedOAuth --> End["Return to Linked Accounts"]
    LinkedNew --> End
    PKCreated --> End
    PKDeleted --> End
```

## 11.6 Export My Data Flow  `P0`
User exports all personal data as a ZIP file containing CSV and JSON formats of expenses, groups, and settlements.

```mermaid
flowchart TD
    Start["Profile"] --> DataMgmt["Data Management"]
    DataMgmt --> Export["Export My Data"]
    
    Export --> Confirm["Confirm Export Request"]
    Confirm -->|User Confirms| Prepare["Prepare Export"]
    
    Prepare --> Collect["Collect User Data"]
    Collect --> C1["Profile Info"]
    Collect --> C2["All Expenses"]
    Collect --> C3["All Groups"]
    Collect --> C4["All Settlements"]
    
    C1 --> Format["Format Data"]
    C2 --> Format
    C3 --> Format
    C4 --> Format
    
    Format --> CSV["Generate CSV Files"]
    Format --> JSON["Generate JSON Files"]
    
    CSV --> Zip["Create ZIP Archive"]
    JSON --> Zip
    
    Zip -->|File Size < 10MB| DirectDownload["Offer Direct Download"]
    Zip -->|File Size >= 10MB| EmailDownload["Send Download Link by Email"]
    
    DirectDownload --> ShowLink["Show Download Link"]
    EmailDownload --> EmailSent["Email Sent to lucas.dow@fidify.se"]
    
    ShowLink --> Download["User Downloads File"]
    EmailSent --> EmailLink["User Clicks Email Link"]
    EmailLink --> Download
    
    Download --> Success["Export Complete"]
    Success --> End["Return to Profile"]
```

## 11.7 Delete Account Flow  `P1`
User initiates account deletion with confirmation, data backup prompt, email verification, and 30-day grace period before permanent deletion.

```mermaid
flowchart TD
    Start["Profile"] --> DangerZone["Danger Zone"]
    DangerZone --> DeleteBtn["Delete Account"]
    
    DeleteBtn --> Warning["⚠️ Warning Screen"]
    Warning --> W1["Groups where you are"]
    Warning --> W2["the only admin will"]
    Warning --> W3["be archived"]
    
    W1 --> DownloadPrompt["Download Your Data First?"]
    W2 --> DownloadPrompt
    W3 --> DownloadPrompt
    
    DownloadPrompt -->|Yes| ExportFlow["Export Data Flow"]
    DownloadPrompt -->|Skip| Continue["Continue to Confirmation"]
    ExportFlow --> Downloaded["Data Downloaded"]
    Downloaded --> Continue
    
    Continue --> Confirm["Confirmation Screen"]
    Confirm --> ConfirmText["Type email to confirm:"]
    ConfirmText --> EmailType["lucas.dow@fidify.se"]
    
    EmailType --> Validate["Validate Email Match"]
    Validate -->|Mismatch| Error["❌ Email doesn't match"]
    Error --> EmailType
    
    Validate -->|Match| FinalConfirm["Confirm Deletion"]
    FinalConfirm --> Queue["Account Queued for Deletion"]
    
    Queue --> GracePeriod["30-Day Grace Period"]
    GracePeriod --> Notify["Confirmation Email Sent"]
    
    Notify --> Status1["User can undo within 30 days"]
    Status1 --> Undo["Tap undo link in email"]
    Undo --> Restored["Account Restored"]
    
    Status1 --> Status2["After 30 days"]
    Status2 --> Permanent["Permanent Deletion Executed"]
    
    Permanent --> Purge["All data purged from system"]
    Purge --> End["Account Deleted"]
```
