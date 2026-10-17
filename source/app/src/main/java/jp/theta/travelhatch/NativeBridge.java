package jp.theta.travelhatch;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * window.TabiNative. Synchronous methods return plain strings; asynchronous ones answer through
 * window.TabiNativeCallback(id, ok, valueJson) on the UI thread.
 */
public class NativeBridge {

    private static final String DATA_FILE = "tabi-data.json";
    // Covers API responses and imported backups.
    private static final int MAX_READ_BYTES = 16 * 1024 * 1024;
    private static final int MAX_PHOTO_EDGE = 1600;
    private static final Pattern PHOTO_NAME = Pattern.compile("[A-Za-z0-9-]+\\.jpg");

    private final MainActivity activity;
    private final WebView webView;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newFixedThreadPool(3);
    private final Object dataLock = new Object();

    NativeBridge(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    static File photoDir(MainActivity a) {
        File dir = new File(a.getFilesDir(), "photos");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return dir;
    }

    // ---- callbacks -------------------------------------------------------------------------

    void resolve(String id, Object value) {
        deliver(id, true, value);
    }

    void reject(String id, String message) {
        deliver(id, false, message);
    }

    private void deliver(String id, boolean ok, Object value) {
        String json;
        if (value == null) json = "null";
        else if (value instanceof JSONObject || value instanceof JSONArray) json = value.toString();
        else json = JSONObject.quote(String.valueOf(value));
        final String script = "window.TabiNativeCallback(" + JSONObject.quote(id) + "," + ok + "," + json + ")";
        ui.post(() -> webView.evaluateJavascript(script, null));
    }

    // ---- storage ---------------------------------------------------------------------------

    @JavascriptInterface
    public String loadData() {
        synchronized (dataLock) {
            File f = new File(activity.getFilesDir(), DATA_FILE);
            if (!f.exists()) return null;
            try {
                return readAll(new java.io.FileInputStream(f));
            } catch (IOException e) {
                return null;
            }
        }
    }

    /** Atomic write: temp file then rename, keeping the previous version as .bak. */
    @JavascriptInterface
    public boolean saveData(String json) {
        synchronized (dataLock) {
            File dir = activity.getFilesDir();
            File f = new File(dir, DATA_FILE);
            File tmp = new File(dir, DATA_FILE + ".tmp");
            File bak = new File(dir, DATA_FILE + ".bak");
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(json.getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            } catch (IOException e) {
                return false;
            }
            if (f.exists()) {
                //noinspection ResultOfMethodCallIgnored
                bak.delete();
                //noinspection ResultOfMethodCallIgnored
                f.renameTo(bak);
            }
            return tmp.renameTo(f);
        }
    }

    @JavascriptInterface
    public String appInfo() {
        try {
            PackageInfo info = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            JSONObject o = new JSONObject();
            o.put("versionName", info.versionName);
            o.put("versionCode", info.getLongVersionCode());
            o.put("package", activity.getPackageName());
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    @JavascriptInterface
    public String consumeSharedText() {
        return activity.consumeShare();
    }

    // ---- network ---------------------------------------------------------------------------

    /** HTTPS only. headersJson is an object of header name to value. */
    @JavascriptInterface
    public void http(String id, String method, String url, String headersJson, String body) {
        io.execute(() -> {
            HttpURLConnection conn = null;
            try {
                URL u = new URL(url);
                if (!"https".equals(u.getProtocol())) throw new IOException("https only");
                conn = (HttpURLConnection) u.openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(60000);
                conn.setRequestMethod("POST".equals(method) ? "POST" : "GET");
                conn.setRequestProperty("User-Agent", "TabiNoTane/" + version() + " (Theta.Travel.Hatch; Android)");
                if (headersJson != null && !headersJson.isEmpty()) {
                    JSONObject h = new JSONObject(headersJson);
                    for (Iterator<String> it = h.keys(); it.hasNext(); ) {
                        String k = it.next();
                        conn.setRequestProperty(k, h.getString(k));
                    }
                }
                if ("POST".equals(method) && body != null) {
                    conn.setDoOutput(true);
                    try (OutputStream out = conn.getOutputStream()) {
                        out.write(body.getBytes(StandardCharsets.UTF_8));
                    }
                }
                int status = conn.getResponseCode();
                InputStream in = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
                String text = in == null ? "" : readAll(in);
                JSONObject res = new JSONObject();
                res.put("status", status);
                res.put("body", text);
                resolve(id, res);
            } catch (Exception e) {
                reject(id, e.getClass().getSimpleName() + ": " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    private String version() {
        try {
            return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "?";
        }
    }

    // ---- intents ---------------------------------------------------------------------------

    @JavascriptInterface
    public void startVoice(String id) {
        ui.post(() -> activity.startVoice(id));
    }

    @JavascriptInterface
    public void pickPhotos(String id) {
        ui.post(() -> activity.pickPhotos(id));
    }

    @JavascriptInterface
    public void exportFile(String id, String fileName, String mime, String content) {
        ui.post(() -> activity.exportFile(id, fileName, mime, content));
    }

    @JavascriptInterface
    public void importFile(String id) {
        ui.post(() -> activity.importFile(id));
    }

    @JavascriptInterface
    public void shareText(String text) {
        ui.post(() -> {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_TEXT, text);
            activity.startActivity(Intent.createChooser(send, null));
        });
    }

    @JavascriptInterface
    public void openUrl(String url) {
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://") || url.startsWith("geo:"))) return;
        ui.post(() -> activity.openExternal(url));
    }

    @JavascriptInterface
    public boolean deletePhoto(String name) {
        if (name == null || !PHOTO_NAME.matcher(name).matches()) return false;
        return new File(photoDir(activity), name).delete();
    }

    void writeDocument(String id, Uri uri, String content) {
        io.execute(() -> {
            try (OutputStream out = activity.getContentResolver().openOutputStream(uri, "wt")) {
                if (out == null) throw new IOException("cannot open");
                out.write(content.getBytes(StandardCharsets.UTF_8));
                resolve(id, uri.getLastPathSegment());
            } catch (Exception e) {
                reject(id, e.getMessage());
            }
        });
    }

    void readDocument(String id, Uri uri) {
        io.execute(() -> {
            try (InputStream in = activity.getContentResolver().openInputStream(uri)) {
                if (in == null) throw new IOException("cannot open");
                resolve(id, readAll(in));
            } catch (Exception e) {
                reject(id, e.getMessage());
            }
        });
    }

    /** Copies picked images into app storage as downscaled JPEGs; answers with the file names. */
    void importPhotos(String id, List<Uri> uris) {
        io.execute(() -> {
            JSONArray names = new JSONArray();
            for (Uri uri : uris) {
                try {
                    names.put(savePhoto(uri));
                } catch (Exception ignored) {
                    // Skip unreadable images; the rest are still added.
                }
            }
            resolve(id, names);
        });
    }

    @SuppressWarnings("ExifInterface") // platform ExifInterface is fine at minSdk 28
    private String savePhoto(Uri uri) throws IOException {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream in = activity.getContentResolver().openInputStream(uri)) {
            BitmapFactory.decodeStream(in, null, bounds);
        }
        int sample = 1;
        while (Math.max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_PHOTO_EDGE) sample *= 2;
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        Bitmap bmp;
        try (InputStream in = activity.getContentResolver().openInputStream(uri)) {
            bmp = BitmapFactory.decodeStream(in, null, opts);
        }
        if (bmp == null) throw new IOException("not an image");

        int rotation = 0;
        try (InputStream in = activity.getContentResolver().openInputStream(uri)) {
            if (in != null) {
                int o = new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
                if (o == ExifInterface.ORIENTATION_ROTATE_90) rotation = 90;
                else if (o == ExifInterface.ORIENTATION_ROTATE_180) rotation = 180;
                else if (o == ExifInterface.ORIENTATION_ROTATE_270) rotation = 270;
            }
        } catch (Exception ignored) {
        }
        float scale = Math.min(1f, (float) MAX_PHOTO_EDGE / Math.max(bmp.getWidth(), bmp.getHeight()));
        if (scale < 1f || rotation != 0) {
            Matrix m = new Matrix();
            m.postScale(scale, scale);
            m.postRotate(rotation);
            Bitmap t = Bitmap.createBitmap(bmp, 0, 0, bmp.getWidth(), bmp.getHeight(), m, true);
            if (t != bmp) bmp.recycle();
            bmp = t;
        }
        String name = UUID.randomUUID() + ".jpg";
        try (FileOutputStream out = new FileOutputStream(new File(photoDir(activity), name))) {
            bmp.compress(Bitmap.CompressFormat.JPEG, 85, out);
        } finally {
            bmp.recycle();
        }
        return name;
    }

    private static String readAll(InputStream in) throws IOException {
        try (InputStream s = in) {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] b = new byte[16384];
            int n;
            while ((n = s.read(b)) > 0) {
                buf.write(b, 0, n);
                if (buf.size() > MAX_READ_BYTES) throw new IOException("too large");
            }
            return buf.toString(StandardCharsets.UTF_8.name());
        }
    }
}
