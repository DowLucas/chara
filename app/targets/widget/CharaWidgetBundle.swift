import SwiftUI
import WidgetKit

@main
struct CharaWidgetBundle: WidgetBundle {
  var body: some Widget {
    CharaBalanceWidget()
  }
}

struct BalanceEntry: TimelineEntry {
  let date: Date
  let snapshot: Snapshot?
}

/**
 The app is the only writer of widget data, so the timeline holds a single
 entry. The refresh interval exists purely so a widget that has gone stale can
 re-render itself dimmed — see `FooterView` — rather than presenting hours-old
 balances as current.
 */
struct BalanceProvider: TimelineProvider {
  func placeholder(in context: Context) -> BalanceEntry {
    BalanceEntry(date: Date(), snapshot: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (BalanceEntry) -> Void) {
    completion(BalanceEntry(date: Date(), snapshot: SnapshotStore.load()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<BalanceEntry>) -> Void) {
    let entry = BalanceEntry(date: Date(), snapshot: SnapshotStore.load())
    let next = Date().addingTimeInterval(6 * 60 * 60)
    completion(Timeline(entries: [entry], policy: .after(next)))
  }
}

struct CharaWidgetEntryView: View {
  @Environment(\.widgetFamily) private var family
  let entry: BalanceEntry

  var body: some View {
    content
      .containerBackground(Theme.paper, for: .widget)
  }

  @ViewBuilder
  private var content: some View {
    if let snapshot = entry.snapshot {
      if snapshot.isSignedOut {
        // Never render a zero amount here — it reads as "all settled up".
        PlaceholderView(message: snapshot.strings.signedOut, snapshot: snapshot)
      } else if snapshot.isEmpty {
        PlaceholderView(message: snapshot.strings.noGroups, snapshot: snapshot)
      } else {
        switch family {
        case .systemSmall:
          // widgetURL and Link do not compose, so the small family is one
          // whole-tile tap target. It opens the app rather than jumping into
          // add-expense: a full-tile hit area is too easy to trigger by
          // accident for an action that starts a write.
          HeroView(snapshot: snapshot)
            .widgetURL(CharaWidgetURLs.home)
        case .systemLarge:
          ListView(snapshot: snapshot, limit: 6)
        default:
          ListView(snapshot: snapshot, limit: 3)
        }
      }
    } else {
      PlaceholderView(message: "Chara", snapshot: nil)
        .redacted(reason: .placeholder)
    }
  }
}

struct CharaBalanceWidget: Widget {
  private let kind = "CharaBalanceWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: BalanceProvider()) { entry in
      CharaWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("Chara")
    .description("Your balances at a glance.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
