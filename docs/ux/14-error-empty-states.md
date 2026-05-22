# UX Diagrams — Error & Empty States

## 14.1 Network Error and Offline State Flow  `P0`

Handles connection loss gracefully: optimistic updates continue locally, mutations queue for later, and on reconnect the queue is flushed with conflict resolution.

```mermaid
stateDiagram-v2
  [*] --> Online
  
  Online --> Offline: Connection Lost
  note right of Online
    Normal operation
    Changes sync immediately
    No queue
  end note
  
  Offline --> OfflineUI: Banner shown
  note right of Offline
    User can still interact
    Optimistic UI applied
    Mutations queued
  end note
  
  OfflineUI --> Reconnecting: Connection Restored
  note right of OfflineUI
    Sync banner visible
    "You're offline"
    Queue pending
  end note
  
  Reconnecting --> QueueFlushing: Queue starts flushing
  Reconnecting --> FlushFailed: Flush error
  
  QueueFlushing --> ConflictResolution: All mutations sent
  note right of ConflictResolution
    Server version vs local
    Merge strategy applied
  end note
  
  ConflictResolution --> Online: Sync complete
  note right of Online
    UI refreshed with server state
  end note
  
  FlushFailed --> RetryOption: Show retry banner
  note right of FlushFailed
    Data preserved locally
    Retry button visible
  end note
  
  RetryOption --> QueueFlushing: User taps retry
  RetryOption --> FlushFailed: Retry fails again
```

---

## 14.2 Empty States Reference  `P0`

Every screen that displays when no content is available shows an appropriate CTA for the user to get started.

```mermaid
flowchart TD
  Start([User Navigates to Screen]) --> Home{Home?}
  Home -->|Yes| HomeEmpty["🏠 No Groups<br/>CTA: Create Group<br/>CTA: Import from Splitwise"]
  
  Home -->|No| GroupDetail{Group Detail?}
  GroupDetail -->|Yes| GroupEmpty["💸 No Expenses<br/>CTA: Add First Expense"]
  
  GroupDetail -->|No| Activity{Activity Feed?}
  Activity -->|Yes| ActivityEmpty["📋 No Activity<br/>Message: No activity yet"]
  
  Activity -->|No| Notify{Notifications?}
  Notify -->|Yes| NotifyEmpty["✓ All Caught Up<br/>Message: You're all caught up"]
  
  Notify -->|No| Search{Search Results?}
  Search -->|Yes| SearchEmpty["🔍 No Matches<br/>Message: No expenses matching '{query}'"]
  
  Search -->|No| Friends{Friends List?}
  Friends -->|Yes| FriendsEmpty["👥 No Friends<br/>Message: Add people to a group to see them here"]
  
  Friends -->|No| DefaultEmpty["⚠️ Empty State"]
```

---

## 14.3 404 and Not-Found Screens  `P0`

Deep-linked or stale resources trigger not-found states with contextual messages and recovery CTAs.

```mermaid
flowchart TD
  DeepLink([Deep Link Arrival]) --> Lookup["Resource Lookup<br/>ID from URL"]
  Lookup --> Found{Found?}
  
  Found -->|Yes| Content["Show Content"]
  
  Found -->|No| WhyNotFound{What is missing?}
  
  WhyNotFound -->|Expense| ExpDeleted["⚠️ Expense Deleted<br/>Message: This expense was deleted<br/>CTA: Return Home<br/>CTA: View Group"]
  
  WhyNotFound -->|Group| GroupRemoved["⚠️ Group Removed<br/>Message: You're no longer in this group<br/>CTA: Return Home<br/>CTA: View Groups"]
  
  WhyNotFound -->|Invite| InviteExpired["⚠️ Invite Expired<br/>Message: This invite has expired<br/>CTA: Return Home"]
  
  WhyNotFound -->|Generic| Generic404["⚠️ Not Found<br/>Message: Something went wrong<br/>CTA: Return Home<br/>CTA: Go Back"]
  
  ExpDeleted --> Home([Home])
  GroupRemoved --> Home
  InviteExpired --> Home
  Generic404 --> Home
```

---

## 14.4 Permission Denied States  `P0`

Actions that require insufficient permissions show clear messages with explanations and alternative options.

```mermaid
flowchart TD
  Action([Action Initiated]) --> Check{Permission<br/>Granted?}
  
  Check -->|Yes| Allow["✓ Proceed"]
  
  Check -->|No| Reason{Why Denied?}
  
  Reason -->|Delete Group| NotAdmin["🔒 Admin Only<br/>Message: Only group admins can do this<br/>CTA: Contact Admin<br/>CTA: Leave Group"]
  
  Reason -->|Edit Expense| NotOwner["🔒 Ownership Check<br/>Message: You can only edit your own expenses<br/>CTA: View Expense Details<br/>CTA: Contact Expense Owner"]
  
  Reason -->|Access Group| NotMember["🔒 Not in Group<br/>Message: You're not in this group<br/>CTA: Return Home<br/>CTA: Request Invite"]
  
  Reason -->|Limit Exceeded| FreeTierLimit["🔒 Plan Limit<br/>Message: Upgrade to Chara Cloud<br/>Upgrade Sheet Shown"]
  
  NotAdmin --> Home([Home])
  NotOwner --> Expense([Expense])
  NotMember --> Home
  FreeTierLimit --> Upgrade([Upgrade Modal])
```

---

## Error Handling Principles

- **No data loss**: Queue persists mutations even if sync fails; user data is never discarded.
- **Offline-first**: UI remains interactive offline; optimistic updates show immediately.
- **Clear messaging**: Banners and modals explain the issue and next steps.
- **Graceful degradation**: Non-critical features degrade; core functionality continues.
- **Retry mechanism**: Failed syncs can be retried; user is never stuck.
