package com.ojosdedios.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Before;
import org.junit.Test;

/** JVM unit tests for the launch-action routing in {@link OjosNativePlugin}. Run by {@code ./gradlew testDebugUnitTest}. */
public class OjosNativePluginTest {

    @Before
    public void clearPending() {
        OjosNativePlugin.takePending();
    }

    @Test
    public void mapsEachShortcutActionToItsShortName() {
        assertEquals("emergency", OjosNativePlugin.actionName(OjosNativePlugin.ACTION_EMERGENCY));
        assertEquals("finder", OjosNativePlugin.actionName(OjosNativePlugin.ACTION_FINDER));
        assertEquals("briefing", OjosNativePlugin.actionName(OjosNativePlugin.ACTION_BRIEFING));
        assertEquals("alert", OjosNativePlugin.actionName(OjosNativePlugin.ACTION_ALERT));
    }

    @Test
    public void ignoresOrdinaryLaunchesAndUnknownActions() {
        assertNull(OjosNativePlugin.actionName(null));
        assertNull(OjosNativePlugin.actionName("android.intent.action.MAIN"));
        assertNull(OjosNativePlugin.actionName("com.ojosdedios.app.SOMETHING_ELSE"));
    }

    @Test
    public void pendingActionIsDeliveredExactlyOnce() {
        assertNull(OjosNativePlugin.takePending());
        assertNull(OjosNativePlugin.rememberLaunch(null));
        assertNull(OjosNativePlugin.takePending());
    }

    @Test
    public void vibrationLimitIsTwoSeconds() {
        assertEquals(2000, OjosNativePlugin.MAX_VIBRATION_MS);
    }
}
