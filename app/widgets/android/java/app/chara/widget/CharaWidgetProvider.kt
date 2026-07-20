package app.chara.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews

/**
 * Homescreen widget backed by the snapshot the app writes on every refresh.
 *
 * Classic RemoteViews rather than Glance: Glance compiles into the app module
 * and would require enabling Compose in the RN app's Gradle — brittle config
 * plugin mods against files Expo rewrites each SDK, plus a compile-time cost
 * on every local release build. A header plus a handful of text rows does not
 * need it.
 *
 * The usual RemoteViews pain (a RemoteViewsService adapter for dynamic lists)
 * is avoided by pre-inflating fixed row slots and hiding the unused ones.
 */
class CharaWidgetProvider : AppWidgetProvider() {

  companion object {
    /** Row slots present in the medium/large layouts. */
    private val ROW_IDS = intArrayOf(
      R.id.row_0, R.id.row_1, R.id.row_2, R.id.row_3, R.id.row_4, R.id.row_5,
    )
    private val ROW_NAME_IDS = intArrayOf(
      R.id.row_0_name, R.id.row_1_name, R.id.row_2_name,
      R.id.row_3_name, R.id.row_4_name, R.id.row_5_name,
    )
    private val ROW_AMOUNT_IDS = intArrayOf(
      R.id.row_0_amount, R.id.row_1_amount, R.id.row_2_amount,
      R.id.row_3_amount, R.id.row_4_amount, R.id.row_5_amount,
    )
  }

  override fun onUpdate(
    context: Context,
    manager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    val snapshot = SnapshotStore.load(context)
    for (id in appWidgetIds) {
      manager.updateAppWidget(id, buildViews(context, snapshot))
    }
  }

  private fun buildViews(context: Context, snapshot: Snapshot?): RemoteViews {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      // API 31+ lets the launcher pick without a round-trip through
      // onAppWidgetOptionsChanged.
      return RemoteViews(
        mapOf(
          SizeF(110f, 110f) to render(context, snapshot, rowLimit = 0),
          SizeF(250f, 110f) to render(context, snapshot, rowLimit = 3),
          SizeF(250f, 250f) to render(context, snapshot, rowLimit = 6),
        )
      )
    }
    return render(context, snapshot, rowLimit = 3)
  }

  private fun render(context: Context, snapshot: Snapshot?, rowLimit: Int): RemoteViews {
    val layout = if (rowLimit == 0) R.layout.chara_widget_small else R.layout.chara_widget_list
    val views = RemoteViews(context.packageName, layout)

    // Whole-tile tap opens the app. Set first so it applies in every branch.
    views.setOnClickPendingIntent(R.id.widget_root, openAppIntent(context))

    if (snapshot == null || snapshot.isSignedOut || snapshot.isEmpty) {
      val message = when {
        snapshot == null -> ""
        snapshot.isSignedOut -> snapshot.signedOutText
        else -> snapshot.noGroupsText
      }
      views.setTextViewText(R.id.placeholder, message)
      views.setViewVisibility(R.id.placeholder, View.VISIBLE)
      views.setViewVisibility(R.id.content, View.GONE)
      // Never leave a stale amount or a "+" shortcut visible when signed out.
      if (rowLimit > 0) views.setViewVisibility(R.id.add_expense, View.GONE)
      return views
    }

    views.setViewVisibility(R.id.placeholder, View.GONE)
    views.setViewVisibility(R.id.content, View.VISIBLE)

    val primary = snapshot.currencies.firstOrNull()
    if (primary != null) {
      views.setTextViewText(R.id.hero_caption, primary.captionText)
      views.setTextViewText(
        R.id.hero_amount,
        if (rowLimit == 0) primary.amountTextCompact else primary.amountText,
      )
      views.setTextColor(R.id.hero_amount, colorFor(context, primary.direction))
      if (rowLimit == 0) views.setTextViewText(R.id.hero_currency, primary.currency)
    }

    views.setTextViewText(R.id.updated_at, snapshot.updatedAtText)
    views.setViewVisibility(
      R.id.partial_marker,
      if (snapshot.partial) View.VISIBLE else View.GONE,
    )

    if (rowLimit > 0) {
      renderRows(context, views, snapshot, rowLimit)
      renderShortcut(context, views, snapshot)
    }

    return views
  }

  private fun renderRows(
    context: Context,
    views: RemoteViews,
    snapshot: Snapshot,
    limit: Int,
  ) {
    val rows = snapshot.groups.take(limit)
    for (slot in ROW_IDS.indices) {
      val visible = slot < rows.size && slot < limit
      views.setViewVisibility(ROW_IDS[slot], if (visible) View.VISIBLE else View.GONE)
      if (!visible) continue

      val row = rows[slot]
      val name = if (row.mixedSigns) "${row.name} !" else row.name
      views.setTextViewText(ROW_NAME_IDS[slot], name)
      views.setTextViewText(ROW_AMOUNT_IDS[slot], row.amountText)
      views.setTextColor(ROW_AMOUNT_IDS[slot], colorFor(context, row.direction))
      views.setOnClickPendingIntent(ROW_IDS[slot], deepLinkIntent(context, row.deepLink, slot))
    }
  }

  private fun renderShortcut(context: Context, views: RemoteViews, snapshot: Snapshot) {
    val shortcut = snapshot.shortcut
    if (shortcut == null) {
      // No remembered group — omit the affordance rather than guess a target.
      views.setViewVisibility(R.id.add_expense, View.GONE)
      return
    }
    views.setViewVisibility(R.id.add_expense, View.VISIBLE)
    views.setContentDescription(
      R.id.add_expense,
      "${snapshot.addExpenseText} · ${shortcut.name}",
    )
    views.setOnClickPendingIntent(
      R.id.add_expense,
      // Request code past the row slots so it can't collide with one.
      deepLinkIntent(context, shortcut.deepLink, ROW_IDS.size),
    )
  }

  private fun colorFor(context: Context, direction: String): Int {
    val res = when (direction) {
      "owe" -> R.color.chara_widget_brick
      "owed" -> R.color.chara_widget_moss
      else -> R.color.chara_widget_lead
    }
    return context.getColor(res)
  }

  private fun openAppIntent(context: Context): PendingIntent {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent(Intent.ACTION_MAIN)
    return PendingIntent.getActivity(
      context,
      /* requestCode = */ 0,
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  /**
   * The deep link arrives already percent-encoded from TypeScript, so it is
   * parsed as-is. Re-encoding here would double-encode the server URL —
   * Uri.encode and encodeURIComponent do not agree on `!'()*` either, which
   * is exactly why there is only one encoder in this system.
   */
  private fun deepLinkIntent(context: Context, deepLink: String, slot: Int): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(deepLink))
      .setPackage(context.packageName)
    return PendingIntent.getActivity(
      context,
      // Unique per slot: PendingIntent equality ignores extras, so distinct
      // request codes keep the rows from aliasing onto each other.
      /* requestCode = */ slot + 1,
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }
}
