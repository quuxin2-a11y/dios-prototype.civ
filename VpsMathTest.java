package com.ojosdedios.app;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/** JVM unit tests for the visual positioning geometry ({@link VpsMath}). Run by {@code ./gradlew testDebugUnitTest}. */
public class VpsMathTest {

    /** A quaternion {x, y, z, w} for a turn of {@code deg} degrees about the up axis (East-Up-South y). */
    private static float[] yaw(double deg) {
        double h = Math.toRadians(deg) / 2;
        return new float[] {0f, (float) Math.sin(h), 0f, (float) Math.cos(h)};
    }

    @Test
    public void distanceAndBearingMatchKnownValues() {
        // Austin's Capitol to the University of Texas Tower: about 1.25 km, a little west of north.
        double d = VpsMath.distance(30.2747, -97.7404, 30.2862, -97.7394);
        assertEquals(1280, d, 30);
        assertEquals(4, VpsMath.bearing(30.2747, -97.7404, 30.2862, -97.7394), 2);
        assertEquals(90, VpsMath.bearing(0, 0, 0, 1), 1e-9);
    }

    @Test
    public void turnsAreSignedAndWrapAround() {
        assertEquals(20, VpsMath.turn(350, 10), 1e-9);
        assertEquals(-20, VpsMath.turn(10, 350), 1e-9);
        assertEquals(180, VpsMath.turn(0, 180), 1e-9);
        assertEquals("Straight ahead", VpsMath.turnWords(5));
        assertEquals("Bear right", VpsMath.turnWords(30));
        assertEquals("Turn left", VpsMath.turnWords(-90));
        assertEquals("Behind you", VpsMath.turnWords(170));
        assertEquals("SW", VpsMath.compass(225));
        assertEquals("N", VpsMath.compass(359));
    }

    @Test
    public void headingFollowsTheCamerasTurn() {
        // With no rotation the camera looks down -z, which in East-Up-South is north.
        assertEquals(0, VpsMath.heading(new float[] {0, 0, 0, 1}), 1e-6);
        // Turning left (counter-clockwise seen from above) by 90 degrees faces west.
        assertEquals(270, VpsMath.heading(yaw(90)), 1e-4);
        assertEquals(90, VpsMath.heading(yaw(-90)), 1e-4);
    }

    @Test
    public void aPlaceStraightAheadProjectsToTheMiddleOfTheScreen() {
        float[] proj = new float[16];
        proj[0] = 1.5f;
        proj[5] = 1.0f;
        // Facing east; the place is 100 m east of the camera at eye height.
        float[] q = yaw(-90);
        double[] e = VpsMath.eus(30, -97, 200, 30, -97 + 100 / (111195 * Math.cos(Math.toRadians(30))), 200);
        double[] cam = VpsMath.rotateInverse(q, e);
        float[] xy = VpsMath.project(cam, proj, 1000, 2000);
        assertArrayEquals(new float[] {500, 1000}, xy, 2f);
        // The same place with the camera facing west is behind it and not drawn.
        assertNull(VpsMath.project(VpsMath.rotateInverse(yaw(90), e), proj, 1000, 2000));
    }

    @Test
    public void theRouteArrowSteersForAPointAhead() {
        double[][] route = new double[11][];
        for (int i = 0; i <= 10; i++) route[i] = new double[] {30 + i * 0.0001, -97};
        // Standing at the third point, 25 m ahead is about the sixth (points are ~11 m apart).
        assertEquals(5, VpsMath.steerTo(route, 30.0002, -97, 25));
        assertEquals(10, VpsMath.steerTo(route, 30.0010, -97, 25));
        assertEquals(-1, VpsMath.steerTo(new double[0][], 30, -97, 25));
        assertEquals(111, VpsMath.remaining(route, 0, 30.0000, -97), 2);
        assertEquals("120 m", VpsMath.metres(118));
        assertEquals("1.5 km", VpsMath.metres(1500));
    }
}
