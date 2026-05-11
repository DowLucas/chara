# UX Diagrams — Search

## 9.1 In-Group Search Flow  `P0`
User types in group search bar and sees live full-text search results of expense titles, notes, and amounts; selecting a result navigates to expense detail.

```mermaid
flowchart TD
    A["Group Detail Screen"] -->|User opens search bar| B["Search Input Active"]
    B -->|User types| C["Query Sent to Backend"]
    C -->|Full-text search: title, notes| D["Results Returned"]
    D -->|Results found| E["Results List Display"]
    D -->|No results| F["Empty State: No Results Found"]
    E -->|User taps result| G["Expense Detail Screen"]
    E -->|User clears search| B
    B -->|User cancels| A
```

## 9.2 Global Search Flow  `P1`
User opens search from home or activity tab and searches across all groups; results are grouped by group name with expense details shown; selecting a result navigates to expense detail with group context.

```mermaid
flowchart TD
    A["Home / Activity Tab"] -->|User opens search| B["Global Search Input Active"]
    B -->|User types| C["Query Sent to Backend"]
    C -->|Search across all groups| D["Results Returned"]
    D -->|Results found| E["Results Grouped by Group Name"]
    D -->|No results| F["Empty State: No Results Found"]
    E -->|User taps result| G["Expense Detail Screen"]
    G -->|Display group context| H["Show Which Group Expense Belongs To"]
    E -->|User clears search| B
    B -->|User cancels| A
```

## 9.3 Filter and Sort Screen  `P1`
Accessed via filter icon in group detail; user can filter by date range, category, payer, and amount; sort by date (default), amount, or title; active filter count shown as badge.

```mermaid
flowchart TD
    A["Group Detail Screen"] -->|User taps filter icon| B["Filter & Sort Screen"]
    B -->|Configure Filters| C["Date Range Picker"]
    B -->|Configure Filters| D["Category Multi-Select"]
    B -->|Configure Filters| E["Payer Selector"]
    B -->|Configure Filters| F["Amount Range Slider"]
    B -->|Configure Sort| G["Sort Options"]
    G -->|Date - Default| H["Sort by Date"]
    G -->|Amount ↑| I["Sort by Amount Ascending"]
    G -->|Amount ↓| J["Sort by Amount Descending"]
    G -->|Title A-Z| K["Sort by Title Alphabetical"]
    C --> L["Apply / Reset Buttons"]
    D --> L
    E --> L
    F --> L
    H --> L
    I --> L
    J --> L
    K --> L
    L -->|User taps Apply| M["Filters Applied"]
    M -->|Badge shows active count| N["Filter Icon Displays Count Badge"]
    N -->|Return to group detail| O["Group Detail With Filters Applied"]
    L -->|User taps Reset| P["Clear All Filters & Sorts"]
    P --> B
```
