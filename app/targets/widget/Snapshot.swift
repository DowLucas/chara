import Foundation

/// Mirrors `lib/widget-snapshot-types.ts`. Keep the two in sync; the version
/// gate below is the safety net when they drift.
struct Snapshot: Codable {
  struct CurrencyRow: Codable {
    let currency: String
    let minor: Int
    let direction: String
    let amountText: String
    let amountTextCompact: String
    let captionText: String
  }

  struct GroupRow: Codable, Identifiable {
    let serverUrl: String
    let groupId: String
    let name: String
    let currency: String
    let minor: Int
    let direction: String
    let amountText: String
    let mixedSigns: Bool
    let deepLink: String

    /// Composite identity — a bare group id is not unique across servers.
    var id: String { "\(serverUrl)::\(groupId)" }
  }

  struct HomeNet: Codable {
    let currency: String
    let minor: Int
    let direction: String
    let amountText: String
    let amountTextCompact: String
    let captionText: String
    let estimated: Bool
  }

  struct Shortcut: Codable {
    let name: String
    let deepLink: String
  }

  struct Strings: Codable {
    let youOwe: String
    let youreOwed: String
    let allSettled: String
    let netBalance: String
    let openChara: String
    let signedOut: String
    let noGroups: String
    let partialNotice: String
    let mixedSignsLabel: String
    let addExpense: String
  }

  let version: Int
  let generatedAt: String
  let updatedAtText: String
  let locale: String
  let language: String
  let homeCurrency: String
  let state: String
  let partial: Bool
  let accountsTotal: Int
  let accountsOk: Int
  let currencies: [CurrencyRow]
  let homeNet: HomeNet?
  let groups: [GroupRow]
  let shortcut: Shortcut?
  let strings: Strings

  var isSignedOut: Bool { state == "signed_out" }
  var isEmpty: Bool { state == "empty" }

  /// Age of the data, used to dim a snapshot the app hasn't refreshed in a
  /// while. Balances are money: stale figures must not read as current.
  var age: TimeInterval? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let date = formatter.date(from: generatedAt)
      ?? ISO8601DateFormatter().date(from: generatedAt) else { return nil }
    return Date().timeIntervalSince(date)
  }

  var isStale: Bool { (age ?? 0) > 6 * 60 * 60 }
}

enum SnapshotStore {
  static let schemaVersion = 1
  private static let key = "snapshot.v1"

  /// App Group is derived from the host bundle id. The extension's own id is
  /// `<host>.widgets`, so strip that suffix to recover the host's.
  static var appGroupIdentifier: String {
    let extensionId = Bundle.main.bundleIdentifier ?? "app.chara.widgets"
    let hostId = extensionId.hasSuffix(".widgets")
      ? String(extensionId.dropLast(".widgets".count))
      : extensionId
    return "group.\(hostId)"
  }

  static func load() -> Snapshot? {
    guard
      let defaults = UserDefaults(suiteName: appGroupIdentifier),
      let raw = defaults.string(forKey: key),
      let data = raw.data(using: .utf8),
      let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data),
      // Render the empty state on a version mismatch rather than decoding
      // a shape we no longer understand.
      snapshot.version == schemaVersion
    else { return nil }
    return snapshot
  }
}
