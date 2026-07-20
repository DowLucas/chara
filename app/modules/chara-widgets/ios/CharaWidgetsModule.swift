import ExpoModulesCore
import WidgetKit

/**
 Writes the widget snapshot into the App Group container the WidgetKit
 extension reads from, then asks WidgetKit to redraw.

 The App Group id is derived from the host app's bundle identifier so the dev
 variant (`app.chara.dev`) gets its own container and cannot clobber a
 production install's widget data on the same device.

 App-initiated reloads are not charged against WidgetKit's refresh budget —
 only timeline-driven ones are — so calling this on every foreground refresh
 is safe.
 */
public class CharaWidgetsModule: Module {
  private static let snapshotKey = "snapshot.v1"

  private var appGroupIdentifier: String {
    let bundleId = Bundle.main.bundleIdentifier ?? "app.chara"
    return "group.\(bundleId)"
  }

  private var sharedDefaults: UserDefaults? {
    UserDefaults(suiteName: appGroupIdentifier)
  }

  public func definition() -> ModuleDefinition {
    Name("CharaWidgets")

    AsyncFunction("setSnapshot") { (json: String) in
      guard let defaults = self.sharedDefaults else {
        // Almost always a missing App Group entitlement on the host app.
        // Surfacing it is worthwhile: the alternative is a widget that shows
        // the empty state forever with no diagnostic anywhere.
        throw AppGroupUnavailableException(self.appGroupIdentifier)
      }
      defaults.set(json, forKey: Self.snapshotKey)
      WidgetCenter.shared.reloadAllTimelines()
    }

    AsyncFunction("clearSnapshot") {
      guard let defaults = self.sharedDefaults else { return }
      // Remove rather than writing an empty payload, so an uninstall right
      // after sign-out leaves nothing behind.
      defaults.removeObject(forKey: Self.snapshotKey)
      WidgetCenter.shared.reloadAllTimelines()
    }
  }
}

internal final class AppGroupUnavailableException: Exception {
  private let identifier: String

  init(_ identifier: String) {
    self.identifier = identifier
    super.init()
  }

  override var reason: String {
    "App Group '\(identifier)' is unavailable — check the host app's entitlements"
  }
}
