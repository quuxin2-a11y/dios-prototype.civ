package com.ojosdedios.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.SystemClock;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Checks official US National Weather Service alerts for the places the user chose, while the app is closed,
 * and posts a notification for each new alert that calls for action.
 *
 * <p>Android wakes it about every 15 minutes (inexact, so the system can batch it with other work) and after the
 * phone restarts. The places are the ones the web layer last sent through {@code setAlertWatch}; this class never
 * reads the phone's location itself. Only public data is fetched (api.weather.gov) and nothing is sent anywhere.
 */
public class AlertChecker extends BroadcastReceiver {

    static final String ACTION_CHECK = "com.ojosdedios.app.CHECK_ALERTS";
    static final String CHANNEL = "official_alerts";
    static final String KEY_ON = "alerts_on";
    static final String KEY_PLACES = "alert_places";
    static final String KEY_SEEN = "alert_seen";
    /** The alerts announced while the app was closed, newest last, for the app's alert history. */
    static final String KEY_LOG = "alert_log";
    /** The newest alert, shown on the home-screen widget until it expires: "event|place|until-millis". */
    static final String KEY_LAST = "alert_last";
    /** Entries kept in {@link #KEY_LOG}. */
    static final int MAX_LOG = 30;
    /** How long the widget shows an alert when the alert gives no end time. */
    static final long DEFAULT_SHOW_MS = 6 * 3600 * 1000L;

    /** At most this many places are checked: the phone's position and up to 8 saved places. */
    static final int MAX_PLACES = 9;
    /** Alert ids remembered so an alert is never announced twice. */
    static final int MAX_SEEN = 300;

    /** Events that always call for action, whatever severity the issuing office gave them. */
    static final Set<String> ACT_NOW = new HashSet<>(Arrays.asList(
            "tornado warning", "flash flood warning", "extreme wind warning", "evacuation immediate",
            "civil emergency message", "civil danger warning", "shelter in place warning",
            "law enforcement warning", "hazardous materials warning", "nuclear power plant warning",
            "radiological hazard warning", "fire warning", "tsunami warning", "hurricane warning",
            "storm surge warning", "earthquake warning", "child abduction emergency",
            "local area emergency", "911 telephone outage emergency", "blizzard warning",
            "ice storm warning", "severe thunderstorm warning", "dust storm warning"));

    /**
     * Whether an alert should interrupt the user: listed events, or anything severe or extreme that is
     * happening now or expected soon. Tests and routine statements never do.
     */
    static boolean callsForAction(String event, String severity, String urgency) {
        String e = event == null ? "" : event.trim().toLowerCase(Locale.US);
        if (e.isEmpty() || e.contains("test")) return false;
        if (ACT_NOW.contains(e)) return true;
        String s = severity == null ? "" : severity.toLowerCase(Locale.US);
        String u = urgency == null ? "" : urgency.toLowerCase(Locale.US);
        return (s.equals("extreme") || s.equals("severe")) && (u.equals("immediate") || u.equals("expected"));
    }

    /** Appends an id to the remembered list, keeping only the newest {@link #MAX_SEEN}. */
    static List<String> remember(List<String> seen, String id) {
        List<String> out = new ArrayList<>(seen);
        out.remove(id);
        out.add(id);
        while (out.size() > MAX_SEEN) out.remove(0);
        return out;
    }

    /** Turns the background check on or off. Safe to call repeatedly. */
    static void schedule(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        PendingIntent wake = PendingIntent.getBroadcast(context, 0,
                new Intent(context, AlertChecker.class).setAction(ACTION_CHECK),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        alarms.cancel(wake);
        if (!prefs(context).getBoolean(KEY_ON, false)) return;
        alarms.setInexactRepeating(AlarmManager.ELAPSED_REALTIME,
                SystemClock.elapsedRealtime() + AlarmManager.INTERVAL_FIFTEEN_MINUTES,
                AlarmManager.INTERVAL_FIFTEEN_MINUTES, wake);
    }

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(OjosNativePlugin.PREFS, Context.MODE_PRIVATE);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            schedule(context);
            return;
        }
        if (!ACTION_CHECK.equals(action)) return;
        final Context app = context.getApplicationContext();
        final PendingResult done = goAsync();
        new Thread(() -> {
            try {
                check(app);
            } catch (Exception ignored) {
                // A failed check is simply tried again at the next wake-up.
            } finally {
                done.finish();
            }
        }, "ojos-alerts").start();
    }

    /** Fetches the alerts for every chosen place and announces the new ones. Runs off the main thread. */
    static void check(Context context) throws Exception {
        SharedPreferences prefs = prefs(context);
        if (!prefs.getBoolean(KEY_ON, false)) return;
        JSONArray places = new JSONArray(prefs.getString(KEY_PLACES, "[]"));
        List<String> seen = new ArrayList<>(Arrays.asList(prefs.getString(KEY_SEEN, "").split("\n")));
        seen.remove("");
        int count = Math.min(MAX_PLACES, places.length());
        for (int i = 0; i < count; i++) {
            JSONObject place = places.getJSONObject(i);
            String url = String.format(Locale.US,
                    "https://api.weather.gov/alerts/active?status=actual&point=%.4f,%.4f",
                    place.getDouble("lat"), place.getDouble("lon"));
            JSONArray features = new JSONObject(get(url)).optJSONArray("features");
            if (features == null) continue;
            for (int k = 0; k < features.length(); k++) {
                JSONObject p = features.getJSONObject(k).optJSONObject("properties");
                if (p == null) continue;
                String id = p.optString("id", "");
                if (id.isEmpty() || seen.contains(id)) continue;
                seen = remember(seen, id);
                if (!callsForAction(p.optString("event"), p.optString("severity"), p.optString("urgency"))) continue;
                String event = p.optString("event", "Official alert");
                String where = place.optString("n", "");
                post(context, id, event, where,
                        p.optString("headline", ""), p.optString("instruction", p.optString("description", "")));
                record(context, id, event, where, p.optString("headline", ""));
            }
        }
        StringBuilder kept = new StringBuilder();
        for (String s : seen) kept.append(s).append('\n');
        prefs.edit().putString(KEY_SEEN, kept.toString()).apply();
    }

    /** Keeps the alert for the app's history and puts it on the home-screen widget. */
    static void record(Context context, String id, String event, String place, String headline) {
        SharedPreferences prefs = prefs(context);
        try {
            JSONArray log = new JSONArray(prefs.getString(KEY_LOG, "[]"));
            JSONObject entry = new JSONObject();
            entry.put("id", id);
            entry.put("t", System.currentTimeMillis());
            entry.put("event", event);
            entry.put("place", place);
            entry.put("headline", headline);
            log.put(entry);
            JSONArray kept = new JSONArray();
            for (int i = Math.max(0, log.length() - MAX_LOG); i < log.length(); i++) kept.put(log.get(i));
            prefs.edit()
                    .putString(KEY_LOG, kept.toString())
                    .putString(KEY_LAST, widgetLine(event, place, System.currentTimeMillis() + DEFAULT_SHOW_MS))
                    .apply();
        } catch (Exception ignored) {
            // The notification already went out; only the history entry is lost.
        }
        EmergencyWidget.refreshAll(context);
    }

    /** "event|place|until" with the separator removed from the text parts. */
    static String widgetLine(String event, String place, long until) {
        return clean(event) + "|" + clean(place) + "|" + until;
    }

    private static String clean(String s) {
        return s == null ? "" : s.replace('|', ' ').trim();
    }

    /**
     * The widget's alert, or null when there is none or it has expired.
     *
     * @return {event, place}
     */
    static String[] widgetAlert(String line, long now) {
        if (line == null) return null;
        String[] parts = line.split("\\|", -1);
        if (parts.length != 3 || parts[0].isEmpty()) return null;
        try {
            if (Long.parseLong(parts[2]) < now) return null;
        } catch (NumberFormatException e) {
            return null;
        }
        return new String[] {parts[0], parts[1]};
    }

    private static String get(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            // api.weather.gov asks every caller to identify itself.
            c.setRequestProperty("User-Agent", "OjosDeDios (github.com/quuxin2-a11y/dios-prototype.civ)");
            c.setRequestProperty("Accept", "application/geo+json");
            if (c.getResponseCode() != 200) throw new IllegalStateException("HTTP " + c.getResponseCode());
            try (InputStream in = c.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                return out.toString(StandardCharsets.UTF_8.name());
            }
        } finally {
            c.disconnect();
        }
    }

    private static void post(Context context, String id, String event, String place, String headline, String text) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Official emergency alerts",
                    NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("National Weather Service warnings for the places you chose");
            ch.enableVibration(true);
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(context, MainActivity.class)
                .setAction(OjosNativePlugin.ACTION_ALERT)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, id.hashCode(), open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String title = "⚠ " + event + (place.isEmpty() ? "" : " · " + place);
        String body = headline.isEmpty() ? text : headline;
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(context, CHANNEL)
                : new Notification.Builder(context);
        b.setSmallIcon(android.R.drawable.stat_sys_warning)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body + (text.isEmpty() ? "" : "\n\n" + text)))
                .setCategory(Notification.CATEGORY_ALARM)
                .setPriority(Notification.PRIORITY_MAX)
                .setDefaults(Notification.DEFAULT_ALL)
                .setAutoCancel(true)
                .setContentIntent(tap);
        nm.notify(id.hashCode(), b.build());
    }
}
