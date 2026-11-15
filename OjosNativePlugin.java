package com.ojosdedios.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.Window;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Native features the web layer cannot reach on its own.
 *
 * <p>Exposed to JavaScript as {@code Capacitor.Plugins.OjosNative}:
 * <ul>
 *   <li>{@code getLaunchAction()}: what the user tapped to open the app (a home-screen shortcut or the widget)</li>
 *   <li>{@code setEmergencyState({on})}: remembers whether State of Emergency mode is on and repaints the widget</li>
 *   <li>{@code keepScreenOn({on})}: stops the screen sleeping while emergency mode is open</li>
 *   <li>{@code vibrate({ms})}: one vibration pulse, used by the SOS signal</li>
 * </ul>
 * It also emits a {@code launchAction} event when a shortcut or the widget is tapped while the app is already running.
 *
 * <p>Nothing here reads contacts, files, location or the network. State is a single boolean in private preferences.
 */
@CapacitorPlugin(name = "OjosNative")
public class OjosNativePlugin extends Plugin {

    static final String ACTION_EMERGENCY = "com.ojosdedios.app.EMERGENCY";
    static final String ACTION_FINDER = "com.ojosdedios.app.FINDER";
    static final String ACTION_BRIEFING = "com.ojosdedios.app.BRIEFING";

    static final String PREFS = "ojos_native";
    static final String KEY_EMERGENCY = "emergency_on";

    /** Longest single vibration we accept from the web layer, in milliseconds. */
    static final int MAX_VIBRATION_MS = 2000;

    private static String pendingAction;

    /**
     * Records the action carried by the intent that opened (or re-opened) the app.
     *
     * @return the short action name ("emergency", "finder", "briefing"), or null for an ordinary launch
     */
    static synchronized String rememberLaunch(Intent intent) {
        String action = actionName(intent == null ? null : intent.getAction());
        if (action != null) {
            pendingAction = action;
        }
        return action;
    }

    /** Maps an intent action to the short name the web layer understands. */
    static String actionName(String intentAction) {
        if (ACTION_EMERGENCY.equals(intentAction)) return "emergency";
        if (ACTION_FINDER.equals(intentAction)) return "finder";
        if (ACTION_BRIEFING.equals(intentAction)) return "briefing";
        return null;
    }

    /** Returns the pending action once, then forgets it, so a shortcut never fires twice. */
    static synchronized String takePending() {
        String action = pendingAction;
        pendingAction = null;
        return action;
    }

    static boolean isEmergencyOn(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_EMERGENCY, false);
    }

    /** Called by MainActivity when a shortcut or the widget is tapped while the app is open. */
    void deliverLaunch() {
        String action = takePending();
        if (action == null) return;
        JSObject data = new JSObject();
        data.put("action", action);
        notifyListeners("launchAction", data, true);
    }

    @PluginMethod
    public void getLaunchAction(PluginCall call) {
        String action = takePending();
        JSObject result = new JSObject();
        result.put("action", action == null ? "" : action);
        call.resolve(result);
    }

    @PluginMethod
    public void setEmergencyState(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        SharedPreferences.Editor editor =
                getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        editor.putBoolean(KEY_EMERGENCY, on);
        editor.apply();
        EmergencyWidget.refreshAll(getContext());
        JSObject result = new JSObject();
        result.put("on", on);
        call.resolve(result);
    }

    @PluginMethod
    public void keepScreenOn(PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            if (on) {
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        });
        call.resolve();
    }

    @PluginMethod
    public void vibrate(PluginCall call) {
        Integer requested = call.getInt("ms", 200);
        int ms = Math.max(1, Math.min(MAX_VIBRATION_MS, requested == null ? 200 : requested));
        Vibrator vibrator = vibrator(getContext());
        if (vibrator == null || !vibrator.hasVibrator()) {
            call.resolve();
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
        } else {
            vibrator.vibrate(ms);
        }
        call.resolve();
    }

    private static Vibrator vibrator(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return manager == null ? null : manager.getDefaultVibrator();
        }
        return (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
    }
}
