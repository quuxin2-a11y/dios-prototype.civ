package com.ojosdedios.app;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.opengl.GLES11Ext;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.Surface;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.google.ar.core.ArCoreApk;
import com.google.ar.core.Camera;
import com.google.ar.core.Config;
import com.google.ar.core.Coordinates2d;
import com.google.ar.core.Earth;
import com.google.ar.core.Frame;
import com.google.ar.core.GeospatialPose;
import com.google.ar.core.Session;
import com.google.ar.core.TrackingState;
import com.google.ar.core.VpsAvailability;
import com.google.ar.core.exceptions.CameraNotAvailableException;
import com.google.ar.core.exceptions.UnavailableException;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

/**
 * Visual positioning: the camera view is matched against Google's Street View imagery (ARCore Geospatial API) to
 * find exactly where the phone is and which way it faces, typically to a metre or two where Street View has been.
 *
 * <p>One screen, three uses, chosen by the web layer ({@code OjosNative.vpsOpen}):
 * <ul>
 *   <li>Pinpoint: shows the accuracy as it improves; "Use this position" hands it back to the app.</li>
 *   <li>Route: a large arrow points along the route the app is following, with the distance left.</li>
 *   <li>Around: names the places the app passed in (live cameras, safe places, the destination) over the camera
 *       view where they really are.</li>
 * </ul>
 * Every few seconds the precise position is also sent back while the screen is open. It only ever locates this
 * phone's own live camera view; no picture is kept.
 *
 * <p>The web layer passes {@code mode}, an optional {@code target} {lat, lon, name}, an optional {@code route}
 * of [lat, lon] pairs and optional {@code points} [{lat, lon, name, kind}], as JSON in the intent.
 */
public class VpsActivity extends Activity implements GLSurfaceView.Renderer {

    static final String EXTRA_JSON = "vps";

    /** Accuracy, in metres, at which a position is good enough to hand back. */
    static final double GOOD_METRES = 8;
    /** Labels drawn at once, nearest first. */
    static final int MAX_LABELS = 14;

    private static final int CAMERA_REQUEST = 4721;
    private static final int ACCENT = 0xFF3FE0D0;
    private static final int PANEL = 0xE6040A10;

    private GLSurfaceView surface;
    private Session session;
    private boolean installRequested;
    private int textureId = -1;
    private int program;
    private int width;
    private int height;
    private final FloatBuffer quad = floats(new float[] {-1, -1, 1, -1, -1, 1, 1, 1});
    private final FloatBuffer quadUv = floats(new float[8]);

    private String mode = "pinpoint";
    private double[] target;
    private String targetName = "";
    private double[][] route;
    private final List<double[]> points = new ArrayList<>();
    private final List<String> pointNames = new ArrayList<>();

    private TextView status;
    private TextView detail;
    private TextView arrow;
    private TextView arrowText;
    private TextView use;
    private FrameLayout labelLayer;
    private final List<TextView> labels = new ArrayList<>();

    private GeospatialPose last;
    private long lastUi;
    private long lastSent;
    private boolean vpsChecked;

    // ----- set-up -----

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        readRequest(getIntent().getStringExtra(EXTRA_JSON));
        setContentView(buildLayout());
    }

    private void readRequest(String json) {
        if (json == null) return;
        try {
            JSONObject o = new JSONObject(json);
            mode = o.optString("mode", "pinpoint");
            JSONObject t = o.optJSONObject("target");
            if (t != null && t.has("lat") && t.has("lon")) {
                target = new double[] {t.getDouble("lat"), t.getDouble("lon")};
                targetName = t.optString("name", "Destination");
            }
            JSONArray r = o.optJSONArray("route");
            if (r != null && r.length() > 1) {
                route = new double[r.length()][];
                for (int i = 0; i < r.length(); i++) {
                    JSONArray p = r.getJSONArray(i);
                    route[i] = new double[] {p.getDouble(0), p.getDouble(1)};
                }
            }
            JSONArray ps = o.optJSONArray("points");
            for (int i = 0; ps != null && i < ps.length() && i < 200; i++) {
                JSONObject p = ps.getJSONObject(i);
                points.add(new double[] {p.getDouble("lat"), p.getDouble("lon")});
                pointNames.add(p.optString("name", ""));
            }
        } catch (Exception e) {
            mode = "pinpoint";
        }
        if (target != null) {
            points.add(target);
            pointNames.add("◎ " + targetName);
        }
    }

    private View buildLayout() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        surface = new GLSurfaceView(this);
        surface.setPreserveEGLContextOnPause(true);
        surface.setEGLContextClientVersion(2);
        surface.setRenderer(this);
        surface.setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);
        root.addView(surface, new FrameLayout.LayoutParams(-1, -1));

        labelLayer = new FrameLayout(this);
        root.addView(labelLayer, new FrameLayout.LayoutParams(-1, -1));

        // Top: close, what the screen is doing and how sure it is.
        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setBackground(round(PANEL, 0));
        top.setPadding(dp(4), dp(28), dp(12), dp(10));
        TextView close = text("✕", 20, ACCENT, false);
        close.setGravity(Gravity.CENTER);
        close.setContentDescription("Close");
        close.setOnClickListener(v -> finish());
        top.addView(close, new LinearLayout.LayoutParams(dp(48), dp(48)));
        LinearLayout words = new LinearLayout(this);
        words.setOrientation(LinearLayout.VERTICAL);
        status = text("Starting the camera…", 15, Color.WHITE, true);
        detail = text("Point the camera at buildings and the street", 12, ACCENT, false);
        detail.setTypeface(Typeface.MONOSPACE);
        words.addView(status);
        words.addView(detail);
        top.addView(words, new LinearLayout.LayoutParams(0, -2, 1f));
        root.addView(top, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));

        // Bottom: the route arrow, or the button that hands the position back.
        LinearLayout bottom = new LinearLayout(this);
        bottom.setOrientation(LinearLayout.VERTICAL);
        bottom.setGravity(Gravity.CENTER_HORIZONTAL);
        bottom.setPadding(dp(16), dp(12), dp(16), dp(28));
        arrow = text("⬆", 84, ACCENT, true);
        arrow.setGravity(Gravity.CENTER);
        arrow.setShadowLayer(12, 0, 0, Color.BLACK);
        arrow.setVisibility(View.GONE);
        arrowText = text("", 16, Color.WHITE, true);
        arrowText.setGravity(Gravity.CENTER);
        arrowText.setBackground(round(PANEL, dp(12)));
        arrowText.setPadding(dp(14), dp(8), dp(14), dp(8));
        arrowText.setVisibility(View.GONE);
        use = text("USE THIS POSITION", 15, 0xFF02080E, true);
        use.setGravity(Gravity.CENTER);
        use.setLetterSpacing(0.06f);
        use.setBackground(round(ACCENT, dp(14)));
        use.setPadding(dp(18), dp(14), dp(18), dp(14));
        use.setAlpha(0.35f);
        use.setOnClickListener(v -> handBack(true));
        use.setVisibility("pinpoint".equals(mode) ? View.VISIBLE : View.GONE);
        bottom.addView(arrow);
        bottom.addView(arrowText);
        LinearLayout.LayoutParams ul = new LinearLayout.LayoutParams(-1, -2);
        ul.topMargin = dp(10);
        bottom.addView(use, ul);
        root.addView(bottom, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        return root;
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (session == null && !startSession()) return;
        try {
            session.resume();
        } catch (CameraNotAvailableException e) {
            fail("The camera is in use by another app.");
            return;
        }
        surface.onResume();
    }

    /** Creates the ARCore session once ARCore is installed and the camera and location are allowed. */
    private boolean startSession() {
        try {
            if (ArCoreApk.getInstance().requestInstall(this, !installRequested)
                    == ArCoreApk.InstallStatus.INSTALL_REQUESTED) {
                installRequested = true;
                return false;
            }
            if (!allowed(Manifest.permission.CAMERA) || !allowed(Manifest.permission.ACCESS_FINE_LOCATION)) {
                if (Build.VERSION.SDK_INT >= 23) {
                    requestPermissions(new String[] {
                        Manifest.permission.CAMERA, Manifest.permission.ACCESS_FINE_LOCATION
                    }, CAMERA_REQUEST);
                }
                return false;
            }
            session = new Session(this);
            if (!session.isGeospatialModeSupported(Config.GeospatialMode.ENABLED)) {
                fail("This phone's sensors are not supported by Google's visual positioning.");
                session = null;
                return false;
            }
            Config config = session.getConfig();
            config.setGeospatialMode(Config.GeospatialMode.ENABLED);
            config.setFocusMode(Config.FocusMode.AUTO);
            session.configure(config);
            return true;
        } catch (UnavailableException e) {
            fail("Google Play Services for AR is needed. Install it from the Play Store and try again.");
        } catch (RuntimeException e) {
            fail("Visual positioning could not start on this phone.");
        }
        session = null;
        return false;
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
        if (code != CAMERA_REQUEST) return;
        for (int r : results) {
            if (r != PackageManager.PERMISSION_GRANTED) {
                fail("Visual positioning needs the camera and location. Allow them for Ojos de Dios in Settings.");
                return;
            }
        }
        recreate();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (session != null) {
            surface.onPause();
            session.pause();
        }
    }

    @Override
    protected void onDestroy() {
        if (session != null) {
            session.close();
            session = null;
        }
        super.onDestroy();
    }

    // ----- drawing the camera picture -----

    @Override
    public void onSurfaceCreated(GL10 gl, EGLConfig config) {
        GLES20.glClearColor(0f, 0f, 0f, 1f);
        int[] t = new int[1];
        GLES20.glGenTextures(1, t, 0);
        textureId = t[0];
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
        program = link(
                "attribute vec4 a_Position; attribute vec2 a_TexCoord; varying vec2 v_TexCoord;"
                        + "void main() { gl_Position = a_Position; v_TexCoord = a_TexCoord; }",
                "#extension GL_OES_EGL_image_external : require\n"
                        + "precision mediump float; varying vec2 v_TexCoord; uniform samplerExternalOES s;"
                        + "void main() { gl_FragColor = texture2D(s, v_TexCoord); }");
    }

    @Override
    public void onSurfaceChanged(GL10 gl, int w, int h) {
        width = w;
        height = h;
        GLES20.glViewport(0, 0, w, h);
        if (session != null) session.setDisplayGeometry(Surface.ROTATION_0, w, h);
    }

    @Override
    public void onDrawFrame(GL10 gl) {
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT);
        Session s = session;
        if (s == null || textureId < 0) return;
        s.setCameraTextureName(textureId);
        s.setDisplayGeometry(Surface.ROTATION_0, width, height);
        Frame frame;
        try {
            frame = s.update();
        } catch (CameraNotAvailableException e) {
            return;
        } catch (RuntimeException e) {
            return;
        }
        if (frame.hasDisplayGeometryChanged()) {
            quad.position(0);
            quadUv.position(0);
            frame.transformCoordinates2d(
                    Coordinates2d.OPENGL_NORMALIZED_DEVICE_COORDINATES, quad,
                    Coordinates2d.TEXTURE_NORMALIZED, quadUv);
        }
        if (frame.getTimestamp() == 0) return;
        drawBackground();
        Camera camera = frame.getCamera();
        float[] proj = new float[16];
        camera.getProjectionMatrix(proj, 0, 0.1f, 2000f);
        Earth earth = s.getEarth();
        long now = System.currentTimeMillis();
        if (now - lastUi < 66) return; // the words and labels change 15 times a second at most
        lastUi = now;
        update(earth, camera.getTrackingState(), proj);
    }

    private void drawBackground() {
        GLES20.glDisable(GLES20.GL_DEPTH_TEST);
        GLES20.glDepthMask(false);
        GLES20.glUseProgram(program);
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0);
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId);
        int pos = GLES20.glGetAttribLocation(program, "a_Position");
        int uv = GLES20.glGetAttribLocation(program, "a_TexCoord");
        quad.position(0);
        quadUv.position(0);
        GLES20.glVertexAttribPointer(pos, 2, GLES20.GL_FLOAT, false, 0, quad);
        GLES20.glVertexAttribPointer(uv, 2, GLES20.GL_FLOAT, false, 0, quadUv);
        GLES20.glEnableVertexAttribArray(pos);
        GLES20.glEnableVertexAttribArray(uv);
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
        GLES20.glDisableVertexAttribArray(pos);
        GLES20.glDisableVertexAttribArray(uv);
        GLES20.glDepthMask(true);
    }

    // ----- what the camera sees, as words, labels and the arrow -----

    private void update(Earth earth, TrackingState camState, float[] proj) {
        if (earth == null) return;
        if (earth.getEarthState() != Earth.EarthState.ENABLED) {
            String why = earth.getEarthState() == Earth.EarthState.ERROR_NOT_AUTHORIZED
                    ? "Visual positioning is not switched on for this app yet (Google Cloud set-up)."
                    : "Visual positioning is not available right now.";
            post(why, "");
            return;
        }
        if (earth.getTrackingState() != TrackingState.TRACKING || camState != TrackingState.TRACKING) {
            post("Looking around…", "Slowly pan across buildings and the street");
            return;
        }
        GeospatialPose p = earth.getCameraGeospatialPose();
        last = p;
        if (!vpsChecked) {
            vpsChecked = true;
            session.checkVpsAvailabilityAsync(p.getLatitude(), p.getLongitude(), a -> {
                if (a != VpsAvailability.AVAILABLE) {
                    runOnUiThread(() -> detail.setText("Street View has not been here: using GPS and the compass"));
                }
            });
        }
        double acc = p.getHorizontalAccuracy();
        float[] q = p.getEastUpSouthQuaternion();
        double heading = VpsMath.heading(q);
        boolean good = acc <= GOOD_METRES;
        String head = String.format(Locale.US, "Located to ±%.1f m", acc);
        String sub = String.format(Locale.US, "FACING %.0f° %s · %.5f, %.5f",
                heading, VpsMath.compass(heading), p.getLatitude(), p.getLongitude());

        // Labels for the places passed in, nearest first.
        List<float[]> spots = new ArrayList<>();
        List<String> names = new ArrayList<>();
        Integer[] order = new Integer[points.size()];
        double[] dist = new double[points.size()];
        for (int i = 0; i < points.size(); i++) {
            order[i] = i;
            dist[i] = VpsMath.distance(p.getLatitude(), p.getLongitude(), points.get(i)[0], points.get(i)[1]);
        }
        java.util.Arrays.sort(order, (a, b) -> Double.compare(dist[a], dist[b]));
        for (Integer i : order) {
            if (spots.size() >= MAX_LABELS || dist[i] > 3000) break;
            double[] pt = points.get(i);
            double[] cam = VpsMath.rotateInverse(q,
                    VpsMath.eus(p.getLatitude(), p.getLongitude(), p.getAltitude(), pt[0], pt[1], p.getAltitude() - 1.4));
            float[] xy = VpsMath.project(cam, proj, width, height);
            if (xy == null || xy[0] < -40 || xy[0] > width + 40) continue;
            spots.add(xy);
            names.add(pointNames.get(i) + " · " + VpsMath.metres(dist[i]));
        }

        // The arrow along the route, or straight to the target.
        String arrowWords = null;
        float arrowTurn = 0;
        if ("route".equals(mode) && (route != null || target != null)) {
            double[] aim = target;
            double left = target == null ? 0
                    : VpsMath.distance(p.getLatitude(), p.getLongitude(), target[0], target[1]);
            if (route != null) {
                int k = VpsMath.steerTo(route, p.getLatitude(), p.getLongitude(), 25);
                aim = route[k];
                left = VpsMath.remaining(route, k, p.getLatitude(), p.getLongitude());
            }
            double t = VpsMath.turn(heading,
                    VpsMath.bearing(p.getLatitude(), p.getLongitude(), aim[0], aim[1]));
            arrowTurn = (float) t;
            arrowWords = left < 15
                    ? "You have arrived at " + targetName
                    : VpsMath.turnWords(t) + " · " + VpsMath.metres(left) + " to " + targetName;
        }
        final String fw = arrowWords;
        final float ft = arrowTurn;
        runOnUiThread(() -> {
            status.setText(head);
            if (!detail.getText().toString().startsWith("Street View has not")) detail.setText(sub);
            use.setAlpha(good ? 1f : 0.35f);
            use.setText(good ? "USE THIS POSITION" : "HOLD STILL · IMPROVING…");
            drawLabels(spots, names);
            arrow.setVisibility(fw == null ? View.GONE : View.VISIBLE);
            arrowText.setVisibility(fw == null ? View.GONE : View.VISIBLE);
            if (fw != null) {
                arrow.setRotation(ft);
                arrowText.setText(fw);
            }
        });
        long now = System.currentTimeMillis();
        if (good && now - lastSent > 3000) {
            lastSent = now;
            handBack(false);
        }
    }

    private void drawLabels(List<float[]> spots, List<String> names) {
        while (labels.size() < spots.size()) {
            TextView t = text("", 12, Color.WHITE, true);
            t.setBackground(round(PANEL, dp(8)));
            t.setPadding(dp(8), dp(4), dp(8), dp(4));
            labelLayer.addView(t, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT));
            labels.add(t);
        }
        for (int i = 0; i < labels.size(); i++) {
            TextView t = labels.get(i);
            if (i >= spots.size()) {
                t.setVisibility(View.GONE);
                continue;
            }
            t.setVisibility(View.VISIBLE);
            t.setText(names.get(i));
            t.setTranslationX(spots.get(i)[0] - t.getWidth() / 2f);
            t.setTranslationY(spots.get(i)[1] - t.getHeight());
        }
    }

    private void post(String head, String sub) {
        runOnUiThread(() -> {
            status.setText(head);
            if (!sub.isEmpty()) detail.setText(sub);
            use.setAlpha(0.35f);
            drawLabels(new ArrayList<>(), new ArrayList<>());
        });
    }

    /** Sends the precise position to the web layer; with {@code done}, closes the screen. */
    private void handBack(boolean done) {
        GeospatialPose p = last;
        if (p == null || (done && p.getHorizontalAccuracy() > GOOD_METRES)) return;
        OjosNativePlugin.vpsFix(p.getLatitude(), p.getLongitude(), p.getAltitude(), p.getHorizontalAccuracy(),
                VpsMath.heading(p.getEastUpSouthQuaternion()), done);
        if (done) finish();
    }

    private void fail(String why) {
        runOnUiThread(() -> {
            status.setText("Visual positioning unavailable");
            detail.setText(why);
            use.setVisibility(View.GONE);
        });
    }

    // ----- small helpers -----

    private boolean allowed(String permission) {
        return Build.VERSION.SDK_INT < 23 || checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextColor(color);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private GradientDrawable round(int color, int radius) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(radius);
        return g;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private static FloatBuffer floats(float[] v) {
        FloatBuffer b = ByteBuffer.allocateDirect(v.length * 4).order(ByteOrder.nativeOrder()).asFloatBuffer();
        b.put(v).position(0);
        return b;
    }

    private static int link(String vs, String fs) {
        int p = GLES20.glCreateProgram();
        GLES20.glAttachShader(p, shader(GLES20.GL_VERTEX_SHADER, vs));
        GLES20.glAttachShader(p, shader(GLES20.GL_FRAGMENT_SHADER, fs));
        GLES20.glLinkProgram(p);
        return p;
    }

    private static int shader(int type, String src) {
        int s = GLES20.glCreateShader(type);
        GLES20.glShaderSource(s, src);
        GLES20.glCompileShader(s);
        return s;
    }
}
