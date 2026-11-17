package com.ojosdedios.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.junit.Test;

/** JVM unit tests for which alerts interrupt the user, in {@link AlertChecker}. */
public class AlertCheckerTest {

    @Test
    public void listedEventsAlwaysCallForAction() {
        assertTrue(AlertChecker.callsForAction("Tornado Warning", "Moderate", "Future"));
        assertTrue(AlertChecker.callsForAction("Civil Emergency Message", "Unknown", "Unknown"));
        assertTrue(AlertChecker.callsForAction(" evacuation immediate ", null, null));
    }

    @Test
    public void severeAlertsCallForActionOnlyWhenHappeningOrExpected() {
        assertTrue(AlertChecker.callsForAction("Winter Storm Warning", "Severe", "Expected"));
        assertTrue(AlertChecker.callsForAction("Excessive Heat Warning", "Extreme", "Immediate"));
        assertFalse(AlertChecker.callsForAction("Winter Storm Watch", "Severe", "Future"));
        assertFalse(AlertChecker.callsForAction("Wind Advisory", "Moderate", "Expected"));
    }

    @Test
    public void testsAndEmptyEventsNeverInterrupt() {
        assertFalse(AlertChecker.callsForAction("Required Weekly Test", "Extreme", "Immediate"));
        assertFalse(AlertChecker.callsForAction("", "Extreme", "Immediate"));
        assertFalse(AlertChecker.callsForAction(null, "Extreme", "Immediate"));
    }

    @Test
    public void remembersEachIdOnceAndOnlyTheNewest() {
        List<String> seen = AlertChecker.remember(new ArrayList<>(), "a");
        seen = AlertChecker.remember(seen, "a");
        assertEquals(Collections.singletonList("a"), seen);
        for (int i = 0; i < AlertChecker.MAX_SEEN + 5; i++) seen = AlertChecker.remember(seen, "id" + i);
        assertEquals(AlertChecker.MAX_SEEN, seen.size());
        assertFalse(seen.contains("a"));
        assertEquals("id" + (AlertChecker.MAX_SEEN + 4), seen.get(seen.size() - 1));
    }

    @Test
    public void widgetShowsAnAlertUntilItEnds() {
        String line = AlertChecker.widgetLine("Tornado Warning", "Mom|s house", 5000L);
        String[] shown = AlertChecker.widgetAlert(line, 4000L);
        assertEquals("Tornado Warning", shown[0]);
        assertEquals("Mom s house", shown[1]);
        assertEquals(null, AlertChecker.widgetAlert(line, 6000L));
    }

    @Test
    public void widgetIgnoresMissingOrDamagedLines() {
        assertEquals(null, AlertChecker.widgetAlert(null, 0L));
        assertEquals(null, AlertChecker.widgetAlert("", 0L));
        assertEquals(null, AlertChecker.widgetAlert("Tornado Warning|Home|soon", 0L));
    }
}
