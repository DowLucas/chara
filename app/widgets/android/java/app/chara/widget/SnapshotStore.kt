package app.chara.widget

import android.content.Context
import org.json.JSONObject

/**
 * Reads the snapshot the app writes via the `CharaWidgets` native module.
 *
 * No App Group equivalent is needed: this provider runs in the app's own
 * process, so private SharedPreferences is both sufficient and correct.
 *
 * Parsed with org.json rather than a serialization library to keep the app
 * module free of another dependency for one small object.
 */
data class CurrencyRow(
  val currency: String,
  val minor: Long,
  val direction: String,
  val amountText: String,
  val amountTextCompact: String,
  val captionText: String,
)

data class GroupRow(
  val name: String,
  val direction: String,
  val amountText: String,
  val mixedSigns: Boolean,
  val deepLink: String,
)

data class Shortcut(val name: String, val deepLink: String)

data class Snapshot(
  val state: String,
  val partial: Boolean,
  val updatedAtText: String,
  val currencies: List<CurrencyRow>,
  val groups: List<GroupRow>,
  val shortcut: Shortcut?,
  val signedOutText: String,
  val noGroupsText: String,
  val addExpenseText: String,
) {
  val isSignedOut: Boolean get() = state == "signed_out"
  val isEmpty: Boolean get() = state == "empty"
}

object SnapshotStore {
  private const val PREFS_NAME = "chara_widget"
  private const val SNAPSHOT_KEY = "snapshot.v1"
  private const val SCHEMA_VERSION = 1

  fun load(context: Context): Snapshot? {
    val raw = context
      .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      .getString(SNAPSHOT_KEY, null) ?: return null

    return runCatching { parse(raw) }.getOrNull()
  }

  private fun parse(raw: String): Snapshot? {
    val root = JSONObject(raw)
    // Render the empty state on a version mismatch rather than misreading a
    // shape we no longer understand.
    if (root.optInt("version") != SCHEMA_VERSION) return null

    val strings = root.optJSONObject("strings")

    val currencies = root.optJSONArray("currencies")?.let { arr ->
      (0 until arr.length()).map { i ->
        val o = arr.getJSONObject(i)
        CurrencyRow(
          currency = o.optString("currency"),
          minor = o.optLong("minor"),
          direction = o.optString("direction"),
          amountText = o.optString("amountText"),
          amountTextCompact = o.optString("amountTextCompact"),
          captionText = o.optString("captionText"),
        )
      }
    } ?: emptyList()

    val groups = root.optJSONArray("groups")?.let { arr ->
      (0 until arr.length()).map { i ->
        val o = arr.getJSONObject(i)
        GroupRow(
          name = o.optString("name"),
          direction = o.optString("direction"),
          amountText = o.optString("amountText"),
          mixedSigns = o.optBoolean("mixedSigns"),
          deepLink = o.optString("deepLink"),
        )
      }
    } ?: emptyList()

    val shortcut = root.optJSONObject("shortcut")?.let {
      Shortcut(name = it.optString("name"), deepLink = it.optString("deepLink"))
    }

    return Snapshot(
      state = root.optString("state"),
      partial = root.optBoolean("partial"),
      updatedAtText = root.optString("updatedAtText"),
      currencies = currencies,
      groups = groups,
      shortcut = shortcut,
      signedOutText = strings?.optString("signedOut").orEmpty(),
      noGroupsText = strings?.optString("noGroups").orEmpty(),
      addExpenseText = strings?.optString("addExpense").orEmpty(),
    )
  }
}
