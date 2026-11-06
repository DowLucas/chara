import SwiftUI
import UIKit

/// Mirrors the semantic tokens in `lib/theme.ts`. Kept as literals because
/// the extension has no access to the JS bundle.
enum Theme {
  /// Light value plus the Sumi dark value (`darkColors`). Widgets follow the
  /// system appearance, not the in-app setting.
  private static func dynamic(_ light: UInt32, _ dark: UInt32, opacity: CGFloat = 1) -> Color {
    func ui(_ hex: UInt32) -> UIColor {
      UIColor(
        red: CGFloat((hex >> 16) & 0xFF) / 255,
        green: CGFloat((hex >> 8) & 0xFF) / 255,
        blue: CGFloat(hex & 0xFF) / 255,
        alpha: opacity
      )
    }
    return Color(UIColor { $0.userInterfaceStyle == .dark ? ui(dark) : ui(light) })
  }

  static let paper = dynamic(0xF0E5CC, 0x1A1512)
  static let bone = dynamic(0xE6D9BB, 0x251E1A)
  static let graphite = dynamic(0x2D1F1A, 0xEFE5CF)
  static let lead = dynamic(0x6B5A4E, 0xB4A592)
  /// "You're owed" / settled.
  static let moss = dynamic(0x1F6458, 0x5DB39C)
  /// "You owe" / destructive.
  static let brick = dynamic(0x8E3B1A, 0xE58B5F)
  static let ruleSoft = dynamic(0x2D1F1A, 0xEFE5CF, opacity: 0.07)

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
