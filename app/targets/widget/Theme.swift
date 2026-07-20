import SwiftUI

/// Mirrors the semantic tokens in `lib/theme.ts`. Kept as literals because
/// the extension has no access to the JS bundle.
enum Theme {
  static let paper = Color(red: 0xF0 / 255, green: 0xE5 / 255, blue: 0xCC / 255)
  static let bone = Color(red: 0xE6 / 255, green: 0xD9 / 255, blue: 0xBB / 255)
  static let graphite = Color(red: 0x2D / 255, green: 0x1F / 255, blue: 0x1A / 255)
  static let lead = Color(red: 0x6B / 255, green: 0x5A / 255, blue: 0x4E / 255)
  /// "You're owed" / settled.
  static let moss = Color(red: 0x58 / 255, green: 0x6D / 255, blue: 0x2A / 255)
  /// "You owe" / destructive.
  static let brick = Color(red: 0x8A / 255, green: 0x2A / 255, blue: 0x2A / 255)
  static let ruleSoft = Color(red: 0x2D / 255, green: 0x1F / 255, blue: 0x1A / 255, opacity: 0.07)

  /// Font names are PostScript names, not filenames — the two differ, and a
  /// wrong value silently falls back to the system font.
  static func display(_ size: CGFloat) -> Font { .custom("SNPro-SemiBold", size: size) }
  static func mono(_ size: CGFloat) -> Font { .custom("JetBrainsMono-Regular", size: size) }
  static func monoMedium(_ size: CGFloat) -> Font { .custom("JetBrainsMono-Medium", size: size) }

  /// Signal colour only where direction actually matters. A neutral amount
  /// (spend history) stays graphite; a balance delta is coloured.
  static func color(for direction: String) -> Color {
    switch direction {
    case "owe": return brick
    case "owed": return moss
    default: return lead
    }
  }
}
