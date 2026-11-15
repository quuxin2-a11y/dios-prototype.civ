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
 * Home-screen widget: one tap opens State of Emergency mode.
 *
 * <p>It turns red while emergency mode is on, so the state is visible without opening the app.
 * It has no timer and makes no network requests; it is repainted only when the app changes the state.
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
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_emergency);
        views.setTextViewText(R.id.widget_title, on ? "EMERGENCY MODE ON" : "⚠ Emergency");
        views.setTextViewText(R.id.widget_sub,
                on ? "Tap to open alerts, safe places and routes" : "Alerts, safe places and the way out");
        views.setInt(R.id.widget_root, "setBackgroundResource",
                on ? R.drawable.widget_bg_red : R.drawable.widget_bg);

        Intent open = new Intent(context, MainActivity.class)
                .setAction(OjosNativePlugin.ACTION_EMERGENCY)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, 0, open, flags));
        return views;
    }
}
