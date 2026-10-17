package jp.theta.travelhatch;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.util.ArrayList;

/**
 * Hosts the web UI (assets/www) in a WebView served from https://appassets.androidplatform.net
 * and exposes {@link NativeBridge} as window.TabiNative.
 */
public class MainActivity extends Activity {

    static final String HOST = "appassets.androidplatform.net";
    static final String START_URL = "https://" + HOST + "/assets/www/index.html";

    static final int REQ_VOICE = 11;
    static final int REQ_PHOTOS = 12;
    static final int REQ_EXPORT = 13;
    static final int REQ_IMPORT = 14;

    private WebView webView;
    private NativeBridge bridge;
    private String pendingShare;

    // One pending activity-result callback per request type.
    String voiceCallbackId;
    String photosCallbackId;
    String exportCallbackId;
    String exportContent;
    String importCallbackId;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        drawEdgeToEdge();
        applySystemBarInsets(root);

        File photoDir = NativeBridge.photoDir(this);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/photos/", new WebViewAssetLoader.InternalStoragePathHandler(this, photoDir))
                .build();

        webView.setBackgroundColor(android.graphics.Color.TRANSPARENT); // no white flash in dark mode
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(true);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (HOST.equals(uri.getHost())) return false;
                openExternal(uri.toString());
                return true;
            }
        });

        // Without a WebChromeClient, confirm() silently returns false and alert() is ignored.
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                        .setOnCancelListener(d -> result.cancel())
                        .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, (d, w) -> result.confirm())
                        .setNegativeButton(android.R.string.cancel, (d, w) -> result.cancel())
                        .setOnCancelListener(d -> result.cancel())
                        .show();
                return true;
            }
        });

        bridge = new NativeBridge(this, webView);
        webView.addJavascriptInterface(bridge, "TabiNative");

        captureShare(getIntent());
        webView.loadUrl(START_URL);
    }

    /** Same layout on every API level: draw behind the bars, then pad by the insets below. */
    @SuppressWarnings("deprecation")
    private void drawEdgeToEdge() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
        } else {
            boolean night = (getResources().getConfiguration().uiMode
                    & android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES;
            int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
            if (!night) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            getWindow().getDecorView().setSystemUiVisibility(flags);
        }
    }

    /** targetSdk 35 is edge-to-edge: keep the bottom nav and save buttons clear of system bars and the keyboard. */
    @SuppressWarnings("deprecation")
    private void applySystemBarInsets(View root) {
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int l, t, r, b;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.graphics.Insets i = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                l = i.left; t = i.top; r = i.right; b = i.bottom;
            } else {
                l = insets.getSystemWindowInsetLeft();
                t = insets.getSystemWindowInsetTop();
                r = insets.getSystemWindowInsetRight();
                b = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(l, t, r, b);
            return insets;
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        captureShare(intent);
        if (pendingShare != null) {
            webView.evaluateJavascript("window.TabiApp && window.TabiApp.onShared()", null);
        }
    }

    private void captureShare(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (text == null) return;
        pendingShare = (subject != null && !text.contains(subject)) ? subject + "\n" + text : text;
    }

    String consumeShare() {
        String s = pendingShare;
        pendingShare = null;
        return s;
    }

    void openExternal(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (ActivityNotFoundException ignored) {
        }
    }

    void startVoice(String callbackId) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ja-JP");
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, getString(R.string.voice_prompt));
        try {
            voiceCallbackId = callbackId;
            startActivityForResult(intent, REQ_VOICE);
        } catch (ActivityNotFoundException e) {
            voiceCallbackId = null;
            bridge.reject(callbackId, getString(R.string.voice_unavailable));
        }
    }

    void pickPhotos(String callbackId) {
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.setType("image/*");
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        photosCallbackId = callbackId;
        startActivityForResult(Intent.createChooser(intent, null), REQ_PHOTOS);
    }

    void exportFile(String callbackId, String fileName, String mime, String content) {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, fileName);
        exportCallbackId = callbackId;
        exportContent = content;
        startActivityForResult(intent, REQ_EXPORT);
    }

    void importFile(String callbackId) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream"});
        importCallbackId = callbackId;
        startActivityForResult(intent, REQ_IMPORT);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        boolean ok = resultCode == RESULT_OK && data != null;
        switch (requestCode) {
            case REQ_VOICE: {
                String id = voiceCallbackId;
                voiceCallbackId = null;
                if (id == null) return;
                ArrayList<String> results = ok ? data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS) : null;
                if (results == null || results.isEmpty()) bridge.resolve(id, null);
                else bridge.resolve(id, results.get(0));
                break;
            }
            case REQ_PHOTOS: {
                String id = photosCallbackId;
                photosCallbackId = null;
                if (id == null) return;
                ArrayList<Uri> uris = new ArrayList<>();
                if (ok) {
                    if (data.getClipData() != null) {
                        for (int i = 0; i < data.getClipData().getItemCount(); i++) {
                            uris.add(data.getClipData().getItemAt(i).getUri());
                        }
                    } else if (data.getData() != null) {
                        uris.add(data.getData());
                    }
                }
                bridge.importPhotos(id, uris);
                break;
            }
            case REQ_EXPORT: {
                String id = exportCallbackId;
                String content = exportContent;
                exportCallbackId = null;
                exportContent = null;
                if (id == null) return;
                if (!ok || data.getData() == null) bridge.resolve(id, null);
                else bridge.writeDocument(id, data.getData(), content);
                break;
            }
            case REQ_IMPORT: {
                String id = importCallbackId;
                importCallbackId = null;
                if (id == null) return;
                if (!ok || data.getData() == null) bridge.resolve(id, null);
                else bridge.readDocument(id, data.getData());
                break;
            }
            default:
                break;
        }
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // Let the web UI close dialogs / go back a screen first.
        webView.evaluateJavascript("window.TabiApp ? window.TabiApp.onBack() : false", value -> {
            if (!"true".equals(value)) MainActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("TabiNative");
            webView.destroy();
        }
        super.onDestroy();
    }
}
