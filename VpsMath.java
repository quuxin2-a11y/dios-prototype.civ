package com.ojosdedios.app;

import java.util.Locale;

/**
 * The geometry behind the visual positioning screen ({@link VpsActivity}), kept free of Android and ARCore so it
 * can be unit tested on its own.
 *
 * <p>ARCore reports where the camera is (latitude, longitude, altitude) and how it is turned, as a quaternion in
 * the East-Up-South frame: x east, y up, z south. The camera itself looks down its own -z axis with +y up the
 * screen. To draw a label over a place, the place is turned into metres east, up and south of the camera, rotated
 * into the camera's frame and projected with the camera's projection matrix.
 */
final class VpsMath {

    static final double EARTH_RADIUS_M = 6371008.8;

    private VpsMath() {}

    /** Great-circle distance in metres. */
    static double distance(double lat1, double lon1, double lat2, double lon2) {
        double p1 = Math.toRadians(lat1), p2 = Math.toRadians(lat2);
        double dp = p2 - p1, dl = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
        return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
    }

    /** Initial bearing from the first point to the second, degrees clockwise from true north, 0 to 360. */
    static double bearing(double lat1, double lon1, double lat2, double lon2) {
        double p1 = Math.toRadians(lat1), p2 = Math.toRadians(lat2), dl = Math.toRadians(lon2 - lon1);
        double y = Math.sin(dl) * Math.cos(p2);
        double x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
        return (Math.toDegrees(Math.atan2(y, x)) + 360) % 360;
    }

    /** Signed difference b - a in degrees, from -180 to 180 (positive means b is to the right). */
    static double turn(double a, double b) {
        double d = ((b - a) % 360 + 540) % 360 - 180;
        return d == -180 ? 180 : d;
    }

    /** Eight-point compass name for a bearing. */
    static String compass(double deg) {
        String[] n = {"N", "NE", "E", "SE", "S", "SW", "W", "NW"};
        return n[(int) Math.round(((deg % 360) + 360) % 360 / 45) % 8];
    }

    /** Spoken-style direction for a turn: "Straight ahead", "Bear right", "Turn left", "Behind you". */
    static String turnWords(double d) {
        double a = Math.abs(d);
        if (a < 15) return "Straight ahead";
        if (a > 150) return "Behind you";
        String side = d > 0 ? "right" : "left";
        return (a < 45 ? "Bear " : "Turn ") + side;
    }

    /** Distance as people say it: metres under a kilometre, otherwise kilometres. */
    static String metres(double m) {
        if (m < 1000) return Math.round(m / 5) * 5 + " m";
        return String.format(Locale.US, "%.1f km", m / 1000);
    }

    /** A place's offset from the camera in metres: {east, up, south}. Flat-earth, fine within a few kilometres. */
    static double[] eus(double lat0, double lon0, double alt0, double lat, double lon, double alt) {
        double north = Math.toRadians(lat - lat0) * EARTH_RADIUS_M;
        double east = Math.toRadians(lon - lon0) * EARTH_RADIUS_M * Math.cos(Math.toRadians((lat + lat0) / 2));
        return new double[] {east, alt - alt0, -north};
    }

    /** Rotates v by the inverse of the unit quaternion q = {x, y, z, w}. */
    static double[] rotateInverse(float[] q, double[] v) {
        double x = -q[0], y = -q[1], z = -q[2], w = q[3];
        // t = 2 * cross(q.xyz, v); v' = v + w * t + cross(q.xyz, t)
        double tx = 2 * (y * v[2] - z * v[1]);
        double ty = 2 * (z * v[0] - x * v[2]);
        double tz = 2 * (x * v[1] - y * v[0]);
        return new double[] {
            v[0] + w * tx + (y * tz - z * ty),
            v[1] + w * ty + (z * tx - x * tz),
            v[2] + w * tz + (x * ty - y * tx)
        };
    }

    /** Where the camera faces, degrees clockwise from true north, from its East-Up-South rotation. */
    static double heading(float[] q) {
        double x = q[0], y = q[1], z = q[2], w = q[3];
        // The camera's forward axis (0, 0, -1) turned into East-Up-South.
        double east = -(2 * (x * z + w * y));
        double south = -(1 - 2 * (x * x + y * y));
        return (Math.toDegrees(Math.atan2(east, -south)) + 360) % 360;
    }

    /**
     * Screen position of a point given in the camera's frame, using a column-major OpenGL projection matrix.
     *
     * @return {x, y} in pixels from the top left, or null when the point is behind the camera
     */
    static float[] project(double[] cam, float[] proj, int width, int height) {
        if (cam[2] > -0.5) return null;
        double depth = -cam[2];
        double nx = (proj[0] * cam[0] + proj[8] * cam[2]) / depth;
        double ny = (proj[5] * cam[1] + proj[9] * cam[2]) / depth;
        return new float[] {(float) ((nx + 1) / 2 * width), (float) ((1 - ny) / 2 * height)};
    }

    /**
     * The route point to steer for: the first point at least {@code ahead} metres past the point of the route
     * nearest to the walker. Route points are {lat, lon} pairs.
     *
     * @return its index, or -1 for an empty route
     */
    static int steerTo(double[][] route, double lat, double lon, double ahead) {
        if (route == null || route.length == 0) return -1;
        int near = 0;
        double best = Double.MAX_VALUE;
        for (int i = 0; i < route.length; i++) {
            double d = distance(lat, lon, route[i][0], route[i][1]);
            if (d < best) {
                best = d;
                near = i;
            }
        }
        double run = 0;
        for (int i = near + 1; i < route.length; i++) {
            run += distance(route[i - 1][0], route[i - 1][1], route[i][0], route[i][1]);
            if (run >= ahead) return i;
        }
        return route.length - 1;
    }

    /** Metres left along the route from the given index to its end, plus the walk to that index. */
    static double remaining(double[][] route, int from, double lat, double lon) {
        if (route == null || from < 0 || from >= route.length) return 0;
        double total = distance(lat, lon, route[from][0], route[from][1]);
        for (int i = from + 1; i < route.length; i++) {
            total += distance(route[i - 1][0], route[i - 1][1], route[i][0], route[i][1]);
        }
        return total;
    }
}
