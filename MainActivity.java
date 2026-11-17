package com.ojosdedios.app;

import android.content.Intent;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Bundle;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

import java.util.ArrayList;
import java.util.List;

/**
 * The app's only screen. It hosts the web layer (index.html) through Capacitor's BridgeActivity and adds:
 * <ul>
 *   <li>the {@link OjosNativePlugin} bridge,</li>
 *   <li>long-press shortcuts on the app icon: Emergency, Finder and Briefing,</li>
 *   <li>routing of shortcut and widget taps to the web layer, whether the app was closed or already open,</li>
 *   <li>the app's own files for its service worker (see {@link #serveServiceWorkerFromApp()}).</li>
 * </ul>
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OjosNativePlugin.class);
        super.onCreate(savedInstanceState);
        serveServiceWorkerFromApp();
        OjosNativePlugin.rememberLaunch(getIntent());
        publishShortcuts();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (OjosNativePlugin.rememberLaunch(intent) == null || getBridge() == null) return;
        PluginHandle handle = getBridge().getPlugin("OjosNative");
        if (handle != null && handle.getInstance() instanceof OjosNativePlugin) {
            ((OjosNativePlugin) handle.getInstance()).deliverLaunch();
        }
    }

    /**
     * The web layer's service worker (sw.js, which keeps map tiles for use without signal) asks for the app's own
     * pages over the network first. Capacitor answers the page's requests from the files inside the APK but not
     * the service worker's, so those requests failed and the worker fell back to the copy it saved, and an updated
     * app kept showing the old version until it was uninstalled. Its requests now get the same files from the APK,
     * so an update takes effect the first time it opens.
     */
    private void serveServiceWorkerFromApp() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N || getBridge() == null) return;
        try {
            ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                    return getBridge() == null || getBridge().getLocalServer() == null
                            ? null
                            : getBridge().getLocalServer().shouldInterceptRequest(request);
                }
            });
        } catch (RuntimeException ignored) {
            // No service worker support in this WebView: nothing was cached by one, so there is nothing to serve.
        }
    }

    /** Long-press shortcuts on the launcher icon (Android 7.1 and newer). */
    private void publishShortcuts() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) return;
        ShortcutManager manager = getSystemService(ShortcutManager.class);
        if (manager == null) return;
        List<ShortcutInfo> shortcuts = new ArrayList<>();
        shortcuts.add(shortcut("emergency", "Emergency", "State of Emergency mode", OjosNativePlugin.ACTION_EMERGENCY));
        shortcuts.add(shortcut("finder", "Finder", "Find a flight, ship or camera", OjosNativePlugin.ACTION_FINDER));
        shortcuts.add(shortcut("briefing", "Briefing", "Today's briefing", OjosNativePlugin.ACTION_BRIEFING));
        try {
            manager.setDynamicShortcuts(shortcuts);
        } catch (IllegalArgumentException | IllegalStateException ignored) {
            // The launcher refused (rate limit or locked device). Shortcuts are a convenience; the app works without them.
        }
    }

    private ShortcutInfo shortcut(String id, String shortLabel, String longLabel, String action) {
        Intent intent = new Intent(this, MainActivity.class)
                .setAction(action)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return new ShortcutInfo.Builder(this, id)
                .setShortLabel(shortLabel)
                .setLongLabel(longLabel)
                .setIcon(Icon.createWithResource(this, R.mipmap.ic_launcher))
                .setIntent(intent)
                .build();
    }
}
