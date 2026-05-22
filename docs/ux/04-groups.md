# UX Diagrams — Groups

## 4.1 Create Group Flow  `P0`
User creates a new group with name, currency, optional avatar, and optional member invites.

```mermaid
flowchart TD
    A["Tab → FAB or '+' button"] -->|Tap| B["New Group Sheet"]
    B --> C["Enter group name"]
    C --> D["Select default currency"]
    D --> E["Optional: Add avatar"]
    E --> F{"Invite members?"}
    F -->|Yes| G["Enter email addresses"]
    G --> H["Review invites"]
    H --> I["Confirm & Create"]
    F -->|No/Skip| I
    I --> J["Group created"]
    J --> K["Empty Group Detail Screen"]
```

## 4.2 Group Detail Screen Layout  `P0`
Main group screen with balance strip, expenses list, navigation tabs, and action buttons.

```mermaid
flowchart TD
    A["Group Detail Screen"]
    A --> B["Header: Group Name + Avatar"]
    B --> C["Balance Strip<br/>You owe $X / Owed to you $Y"]
    C --> D["Search Bar<br/>Filter expenses"]
    D --> E["Tabs: Expenses | Balances | Activity"]
    E --> F["Expenses List<br/>Reverse chronological"]
    F --> G["FAB: Add Expense"]
    F --> H["'Settle Up' Button<br/>Bottom action"]
    
    style A fill:#e1f5ff
    style C fill:#fff3e0
    style G fill:#c8e6c9
    style H fill:#f3e5f5
```

## 4.3 Group Members Screen  `P0`
View all group members with individual balances, ghost status indicator, and admin controls.

```mermaid
flowchart TD
    A["Members Screen"]
    A --> B["Members List"]
    B --> C["Regular Member<br/>Name + Avatar<br/>Balance: $X"]
    B --> D["Ghost Member<br/>Email + 'Pending' badge<br/>Balance: $X"]
    A --> E["Admin Controls"]
    E --> F["Remove Member"]
    E --> G["Promote to Admin"]
    A --> H["'Invite' Button<br/>Top right"]
    
    style D fill:#f5f5f5
    style E fill:#fff9c4
```

## 4.4 Invite by Email Flow  `P0`
Admin invites members by email from the members screen.

```mermaid
flowchart TD
    A["Members Screen"] -->|Tap 'Invite'| B["Invite Sheet"]
    B --> C["Enter email address(es)"]
    C --> D["Add multiple emails<br/>or one at a time"]
    D --> E["Tap 'Send Invites'"]
    E --> F["Invites sent"]
    F --> G["Update Members List<br/>New ghosts show 'pending'"]
    
    style G fill:#fff9c4
```

## 4.5 Invite by Shareable Link Flow  `P0`
Generate and share a join link that recipients can open to join the group.

```mermaid
flowchart TD
    A["Members Screen"] -->|Tap 'Share Link'| B["Link generated<br/>chara://join/{token}"]
    B --> C["System Share Sheet"]
    C --> D["Copy link or share<br/>to messaging/email"]
    D --> E["Recipient receives link"]
    E --> F["Recipient taps link<br/>Opens Chara app"]
    
    style B fill:#c8e6c9
    style F fill:#bbdefb
```

## 4.6 Accept Group Invite Flow  `P0`
User accepts a group invite via deep link, with handling for logged-in and new users.

```mermaid
flowchart TD
    A["Receive chara://join/{token}"]
    A --> B{"User logged in?"}
    B -->|Yes| C["Show Confirmation Sheet<br/>Group name + member count"]
    B -->|No| D["Navigate to Auth Screen"]
    D --> E["User signs up or logs in"]
    E --> C
    C --> F{"Accept invite?"}
    F -->|Yes| G["Add user to group"]
    F -->|No| H["Dismiss"]
    G --> I["Navigate to Group Detail<br/>New member listed"]
    
    A --> J{"Link validity?"}
    J -->|Expired| K["Show error:<br/>Invite link expired"]
    J -->|Already member| L["Show notice:<br/>Already in group<br/>Navigate to detail"]
    
    style C fill:#e3f2fd
    style K fill:#ffebee
    style L fill:#fff9c4
```

## 4.7 Group Settings Screen  `P0`
Admin panel for group configuration, including name, currency, simplification, and danger zone.

```mermaid
flowchart TD
    A["Group Settings Screen"]
    A --> B["Basic Settings"]
    B --> C["Edit group name"]
    B --> D["Select default currency"]
    B --> E["Change avatar"]
    
    A --> F["Simplify Debts"]
    F --> G["Toggle on/off"]
    G --> H["Tap for explanation<br/>sheet + algorithm info"]
    
    A --> I["Danger Zone"]
    I --> J["Archive Group<br/>Admin only"]
    J --> K["Freezes group<br/>No new expenses"]
    I --> L["Delete Group<br/>Admin only"]
    L --> M["Permanent deletion<br/>Confirm required"]
    
    A --> N["Export Data"]
    N --> O["Download CSV<br/>or JSON"]
    
    style I fill:#ffebee
    style J fill:#ffe0b2
    style L fill:#ffcdd2
```

## 4.8 Leave or Archive Group Flow  `P1`
Leave requires zero balance; archive is admin-only and freezes the group.

```mermaid
flowchart TD
    A{"Action chosen?"}
    
    A -->|Leave| B{"Balance = $0?"}
    B -->|Yes| C["Confirmation sheet<br/>Are you sure?"]
    C -->|Confirm| D["User removed from group"]
    B -->|No| E["Warning sheet<br/>Settle up first or<br/>request forgiveness"]
    E -->|OK| F["Back to members screen"]
    
    A -->|Archive| G{"Admin only?"}
    G -->|Yes| H["Confirmation sheet<br/>Group will be frozen"]
    H -->|Confirm| I["Group archived<br/>No new expenses allowed<br/>Visible in archive tab"]
    G -->|No| J["Error: Not an admin"]
    
    D --> K["Navigate away<br/>Group removed from list"]
    
    style E fill:#fff9c4
    style I fill:#ffe0b2
```

## 4.9 Remove Member Flow  `P1`
Admin removes a member, with warning if outstanding balance exists.

```mermaid
flowchart TD
    A["Members Screen"] -->|Admin taps member| B["Member options menu"]
    B -->|Tap 'Remove'| C{"Outstanding balance?"}
    C -->|No balance| D["Confirmation sheet<br/>Remove this member?"]
    C -->|Yes| E["Warning sheet<br/>Member owes / is owed $X<br/>Remove anyway?"]
    
    D -->|Confirm| F["Member removed"]
    E -->|Confirm| F
    
    D -->|Cancel| G["Back to menu"]
    E -->|Cancel| G
    
    F --> H["Update members list<br/>Member no longer visible"]
    
    style E fill:#fff9c4
    style F fill:#f3e5f5
```

## 4.10 Ghost Member → Real User Claim Flow  `P1`
Ghost member (added by email) signs up; system auto-links their account to the ghost record.

```mermaid
flowchart TD
    A["Ghost member invited<br/>Email: alice@example.com<br/>Status: Pending"]
    A --> B["alice@example.com<br/>receives invite email"]
    B --> C["alice signs up in Chara<br/>with same email"]
    C --> D["System detects<br/>email match"]
    D --> E["Ghost record linked<br/>to new account"]
    E --> F["alice becomes<br/>active member<br/>No action needed"]
    
    style A fill:#f5f5f5
    style F fill:#c8e6c9
```

## 4.11 Debt Simplification Toggle Flow  `P1`
Admin toggles debt simplification; system recalculates balances using minimum-cash-flow algorithm.

```mermaid
flowchart TD
    A["Group Settings"] --> B["Simplify Debts toggle"]
    B -->|Tap to toggle| C{"Explanation needed?"}
    C -->|Tap info icon| D["Show explanation sheet<br/>What is debt simplification?<br/>Example: Alice->Bob->Charlie<br/>becomes Alice->Bob + Bob->Charlie"]
    D --> E{"Confirm toggle?"}
    C -->|No| E
    
    E -->|Confirm| F["System recalculates<br/>using algorithm"]
    F --> G["Balances updated<br/>across all members"]
    G --> H["New settlement paths<br/>shown in Balances tab"]
    
    E -->|Cancel| I["Toggle unchanged"]
    
    style D fill:#e3f2fd
    style G fill:#c8e6c9
```
