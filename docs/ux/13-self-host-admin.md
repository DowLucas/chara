# UX Diagrams — Self-Host Setup & Admin

## 13.1 Self-Host First-Run Setup Flow  `P0`

Admin starts containers with `docker compose up`, opens browser, and completes initial configuration.

```mermaid
flowchart TD
    A["docker compose up<br/>3 containers start"] --> B["User opens browser<br/>localhost:8080"]
    B --> C{Setup complete?}
    C -->|No| D["/setup page"]
    D --> E["Enter admin email<br/>+ password"]
    E --> F["Enter instance name<br/>+ public URL"]
    F --> G{Configure SMTP?}
    G -->|Yes| H["Enter SMTP settings<br/>for magic links"]
    G -->|No| I{Configure OIDC?}
    H --> I
    I -->|Yes| J["Enter OIDC provider<br/>details"]
    I -->|No| K["Setup complete"]
    J --> K
    K --> L["Redirect to /login"]
    C -->|Yes| L
    L --> M["Admin logs in"]
```

---

## 13.2 Admin Dashboard Screen Layout  `P1`

Dashboard displays user management, system health, and operational metrics.

```mermaid
flowchart TD
    A["Admin Dashboard"]
    A --> B["User Management"]
    A --> C["System Health"]
    A --> D["Storage"]
    A --> E["Jobs & Errors"]
    
    B --> B1["User List<br/>Invite / Disable actions"]
    B --> B2["Active Session Count"]
    
    C --> C1["River Job Queue<br/>Pending / Failed counts"]
    C --> C2["Recent Error Log<br/>Last 10 entries"]
    
    D --> D1["Postgres Size"]
    D --> D2["MinIO Size"]
    
    E --> E1["Backup Status"]
    E --> E2["Last Backup Time"]
```

---

## 13.3 OIDC Configuration Flow  `P0`

Admin configures single sign-on provider through settings interface.

```mermaid
sequenceDiagram
    participant Admin
    participant UI as Admin UI
    participant API as Backend
    participant OIDC as OIDC Provider
    
    Admin->>UI: Settings → Authentication
    UI->>UI: Show "Add OIDC Provider"
    Admin->>UI: Enter issuer URL<br/>+ client ID<br/>+ client secret
    Admin->>UI: Click "Test connection"
    UI->>API: POST /admin/oidc/test
    API->>OIDC: Discover metadata
    OIDC-->>API: Return provider config
    API-->>UI: Success/Failure
    UI-->>Admin: Show feedback
    
    alt Success
        Admin->>UI: Click "Save"
        UI->>API: POST /admin/oidc/save
        API-->>UI: Saved
        UI-->>Admin: "Users can now use SSO"
    else Failure
        UI-->>Admin: Show error details
    end
```

---

## 13.4 Backup and Restore Flow  `P0`

Two paths for backup/restore: CLI for automation, UI for manual operations.

```mermaid
flowchart TD
    A["Backup & Restore"]
    A --> B["CLI Path"]
    A --> C["Admin UI Path"]
    
    B --> B1["quits backup"]
    B1 --> B2["Create encrypted zip<br/>Postgres dump + MinIO"]
    B2 --> B3["Save to configured path"]
    B3 --> B4["Backup complete"]
    
    B4 --> B5["quits restore<br/>path/to/backup.zip"]
    B5 --> B6["Decrypt & restore<br/>Postgres + MinIO"]
    B6 --> B7["Restore complete"]
    
    C --> C1["Admin Dashboard"]
    C1 --> C2["Click Backup button"]
    C2 --> C3["Trigger backup<br/>same as CLI"]
    C3 --> C4["Generate download link"]
    C4 --> C5["Admin downloads .zip"]
    
    C5 --> C6["Restore flow"]
    C6 --> C7["Upload backup file"]
    C7 --> C8["Validate & decrypt"]
    C8 --> C9["Restore to instance"]
    C9 --> C10["Restore complete"]
```

---

## 13.5 Instance URL Entry on Mobile (Self-Host)  `P0`

Mobile app first launch guides user to local or self-hosted instance selection.

```mermaid
stateDiagram-v2
    [*] --> LaunchScreen
    
    LaunchScreen --> HostChoice: App starts
    
    HostChoice: "Hosted or self-hosted?"
    
    HostChoice --> SelfHosted: Tap "Self-hosted"
    HostChoice --> Hosted: Tap "Use quits.app"
    
    SelfHosted --> URLEntry: Show URL input screen
    
    URLEntry --> URLInput: User enters URL<br/>e.g. https://quits.myserver.com
    
    URLInput --> Validate: Submit
    
    Validate --> CheckHealth: POST /api/health/liveness
    
    CheckHealth --> Reachable: Instance responds
    CheckHealth --> Unreachable: No response
    
    Reachable --> AuthFlow: Proceed to login
    
    Unreachable --> Error: Show error<br/>"Instance unreachable"
    Error --> URLEntry: Return to input
    
    Hosted --> CloudAuth: Connect to cloud
    
    AuthFlow --> [*]
    CloudAuth --> [*]
```

