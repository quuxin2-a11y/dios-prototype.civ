package com.ojosdedios.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.widget.RemoteViews;

/**
 * Home-screen widget: the newest official warning for your places, or one tap into State of Emergency mode.
 *
 * <p>While a warning is current it shows the warning and the place it is for, and a tap opens it. Otherwise it turns
 * red while emergency mode is on, so the state is visible without opening the app. It makes no network requests: it is
 * repainted when the app or the background alert check changes something, and every 30 minutes so an expired warning
 * is taken down.
 */
public class EmergencyWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int id : widgetIds) {
            manager.updateAppWidget(id, views(context));
        }
    }

    /** Repaints every placed copy of the widget. Safe to call when none are placed. */
    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        if (manager == null) return;
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, EmergencyWidget.class));
        for (int id : ids) {
            manager.updateAppWidget(id, views(context));
        }
    }

    static RemoteViews views(Context context) {
        boolean on = OjosNativePlugin.isEmergencyOn(context);
        String[] alert = AlertChecker.widgetAlert(
                AlertChecker.prefs(context).getString(AlertChecker.KEY_LAST, null), System.currentTimeMillis());
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_emergency);
        if (alert != null) {
            views.setTextViewText(R.id.widget_title, "⚠ " + alert[0]);
            views.setTextViewText(R.id.widget_sub,
                    (alert[1].isEmpty() ? "Where you are" : alert[1]) + " · tap for what to do");
        } else {
            views.setTextViewText(R.id.widget_title, on ? "EMERGENCY MODE ON" : "⚠ Emergency");
            views.setTextViewText(R.id.widget_sub,
                    on ? "Tap to open alerts, safe places and routes" : "No warnings for your places · tap for help");
        }
        views.setInt(R.id.widget_root, "setBackgroundResource",
                on || alert != null ? R.drawable.widget_bg_red : R.drawable.widget_bg);

        Intent open = new Intent(context, MainActivity.class)
                .setAction(alert != null ? OjosNativePlugin.ACTION_ALERT : OjosNativePlugin.ACTION_EMERGENCY)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, 0, open, flags));
        return views;
    }
}
