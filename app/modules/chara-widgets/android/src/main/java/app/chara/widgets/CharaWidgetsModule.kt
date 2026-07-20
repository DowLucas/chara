package app.chara.widgets

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Writes the widget snapshot to SharedPreferences and pokes the provider.
 *
 * Unlike iOS there is no App Group here: the widget provider runs in this
 * app's own process, so private SharedPreferences is both sufficient and
 * correct. (MODE_WORLD_READABLE was removed in API 24 and would be a leak
 * regardless — the snapshot describes the user's finances.)
 */
class CharaWidgetsModule : Module() {
  companion object {
    const val PREFS_NAME = "chara_widget"
    const val SNAPSHOT_KEY = "snapshot.v1"
    const val PROVIDER_CLASS = "app.chara.widget.CharaWidgetProvider"
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context unavailable" }

  override fun definition() = ModuleDefinition {
    Name("CharaWidgets")

    AsyncFunction("setSnapshot") { json: String ->
      prefs().edit().putString(SNAPSHOT_KEY, json).apply()
      notifyProvider()
    }

    AsyncFunction("clearSnapshot") {
      // Remove rather than blanking, so nothing survives sign-out.
      prefs().edit().remove(SNAPSHOT_KEY).apply()
      notifyProvider()
    }
  }

  private fun prefs() = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  /**
   * Broadcast an update to our own provider. Skipped when no widget has been
   * placed, so signing out on a device without widgets costs nothing.
   */
  private fun notifyProvider() {
    val component = ComponentName(context.packageName, PROVIDER_CLASS)
    val manager = AppWidgetManager.getInstance(context)
    val ids = runCatching { manager.getAppWidgetIds(component) }.getOrNull() ?: return
    if (ids.isEmpty()) return

    val intent = Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).apply {
      setComponent(component)
      putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
    }
    context.sendBroadcast(intent)
  }
}
