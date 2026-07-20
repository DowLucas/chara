import SwiftUI
import WidgetKit

/// Small family: a single per-currency hero.
///
/// Deliberately shows one currency rather than a cross-currency sum. The app
/// refuses to collapse mixed-sign currencies into one number (see
/// `lib/balance-summary.ts`), and the widget must not reintroduce that lie in
/// the name of fitting a small tile.
struct HeroView: View {
  let snapshot: Snapshot

  private var primary: Snapshot.CurrencyRow? { snapshot.currencies.first }

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(primary?.captionText ?? snapshot.strings.allSettled)
        .font(Theme.mono(11))
        .tracking(0.3)
        .foregroundStyle(Theme.lead)
        .textCase(.uppercase)
        .lineLimit(1)

      if let row = primary {
        Text(row.amountTextCompact)
          .font(Theme.monoMedium(28))
          .foregroundStyle(Theme.color(for: row.direction))
          .minimumScaleFactor(0.6)
          .lineLimit(1)

        Text(row.currency)
          .font(Theme.mono(11))
          .foregroundStyle(Theme.lead)
      }

      Spacer(minLength: 0)

      if snapshot.currencies.count > 1 {
        Text("+\(snapshot.currencies.count - 1)")
          .font(Theme.mono(10))
          .foregroundStyle(Theme.lead)
      }

      FooterView(snapshot: snapshot)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// A single group row: name on the left, its dominant balance on the right.
struct GroupRowView: View {
  let row: Snapshot.GroupRow

  var body: some View {
    HStack(spacing: 6) {
      Text(row.name)
        .font(Theme.display(13))
        .foregroundStyle(Theme.graphite)
        .lineLimit(1)

      if row.mixedSigns {
        // The headline hides an opposing balance in another currency.
        Image(systemName: "exclamationmark.circle")
          .font(.system(size: 9))
          .foregroundStyle(Theme.lead)
      }

      Spacer(minLength: 4)

      Text(row.amountText)
        .font(Theme.monoMedium(13))
        .monospacedDigit()
        .foregroundStyle(Theme.color(for: row.direction))
        .lineLimit(1)
    }
  }
}

/// Medium / large: per-currency header, then the biggest open positions.
struct ListView: View {
  let snapshot: Snapshot
  let limit: Int

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .firstTextBaseline) {
        if let row = snapshot.currencies.first {
          Text(row.captionText)
            .font(Theme.mono(11))
            .tracking(0.3)
            .textCase(.uppercase)
            .foregroundStyle(Theme.lead)
          Spacer()
          Text(row.amountText)
            .font(Theme.monoMedium(17))
            .monospacedDigit()
            .foregroundStyle(Theme.color(for: row.direction))
            .lineLimit(1)
        } else {
          Spacer()
        }

        // Expense shortcut: straight into the most recently opened group's
        // add-expense form. Omitted entirely when no group is remembered,
        // rather than guessing a destination.
        if let shortcut = snapshot.shortcut, let url = URL(string: shortcut.deepLink) {
          Link(destination: url) {
            Image(systemName: "plus")
              .font(.system(size: 11, weight: .semibold))
              .foregroundStyle(Theme.graphite)
              .padding(4)
              .background(Theme.bone, in: Circle())
          }
          .accessibilityLabel("\(snapshot.strings.addExpense) · \(shortcut.name)")
        }
      }

      Rectangle()
        .fill(Theme.ruleSoft)
        .frame(height: 1)

      ForEach(snapshot.groups.prefix(limit)) { row in
        Link(destination: URL(string: row.deepLink) ?? CharaWidgetURLs.home) {
          GroupRowView(row: row)
        }
      }

      Spacer(minLength: 0)
      FooterView(snapshot: snapshot)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// "as of" stamp plus the partial-data caveat.
///
/// The stamp is not decoration. Snapshots are only written while the app is
/// foregrounded, so a widget can legitimately be hours old; an unqualified
/// balance would read as current.
struct FooterView: View {
  let snapshot: Snapshot

  var body: some View {
    HStack(spacing: 4) {
      if snapshot.partial {
        Image(systemName: "exclamationmark.triangle")
          .font(.system(size: 8))
          .foregroundStyle(Theme.lead)
      }
      Text(snapshot.updatedAtText)
        .font(Theme.mono(9))
        .foregroundStyle(Theme.lead.opacity(snapshot.isStale ? 0.5 : 1))
    }
  }
}

/// Signed out, or signed in with nothing to show.
struct PlaceholderView: View {
  let message: String
  let snapshot: Snapshot?

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text("CHARA")
        .font(Theme.mono(10))
        .tracking(1.2)
        .foregroundStyle(Theme.lead)
      Spacer(minLength: 0)
      Text(message)
        .font(Theme.display(14))
        .foregroundStyle(Theme.graphite)
        .lineLimit(3)
      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

enum CharaWidgetURLs {
  /// Bare scheme: the classifier ignores it and the app opens on its last
  /// route. `chara://groups` would classify as *malformed* and do nothing.
  static let home = URL(string: "chara://")!
}
