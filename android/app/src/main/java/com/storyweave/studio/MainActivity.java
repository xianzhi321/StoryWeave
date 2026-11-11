package com.storyweave.studio;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.ConsoleMessage;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.util.Log;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.RenderProcessGoneDetail;
import android.widget.Toast;
import android.view.ViewGroup;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import java.io.OutputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.nio.charset.StandardCharsets;

/** Native shell: local app assets, system document picker and export.
 *  All normal writing data remains in WebView IndexedDB. */
public class MainActivity extends Activity {
    private static final int REQUEST_PICK_FILE = 1001;
    private static final int REQUEST_SAVE_DOCUMENT = 1002;
    private WebView webView;
    private boolean immersiveWriting;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingText;
    private String pendingMime;
    /** One queue: a writing request cannot launch multiple large generations at once. */
    private final ExecutorService localAiQueue = Executors.newSingleThreadExecutor();
    private final ExecutorService cloudAiQueue = Executors.newFixedThreadPool(2);
    private CloudAi cloudAi;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        // Tablets enter native Android Views; no WebView is created on this path.
        if (getResources().getConfiguration().smallestScreenWidthDp >= 600 &&
                !getIntent().getBooleanExtra("legacyExportOnly", false)) {
            startActivity(new Intent(this, NativeTabletActivity.class));
            finish();
            return;
        }
        cloudAi = new CloudAi(this);
        getWindow().setStatusBarColor(Color.rgb(246, 245, 240));
        getWindow().setNavigationBarColor(Color.rgb(246, 245, 240));
        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(-1, -1));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.addJavascriptInterface(new StoryBridge(), "StoryBridge");
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // A renderer crash (including memory pressure while reading a book) must
                // not take down the whole Android process. Recreate a fresh WebView.
                Log.e("StoryWeave", "WebView renderer gone, crashed=" + detail.didCrash());
                deliverFileSelection(null);
                if (webView == view) {
                    webView = null;
                    immersiveWriting = false;
                    applyWritingSystemBars();
                }
                if (view.getParent() instanceof ViewGroup) {
                    ((ViewGroup) view.getParent()).removeView(view);
                }
                view.destroy();
                Toast.makeText(MainActivity.this,
                        "写作界面意外关闭，正在恢复；请检查最近修改是否保存", Toast.LENGTH_LONG).show();
                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                    if (!isFinishing() && !isDestroyed()) recreate();
                }, 400);
                return true;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri.toString().startsWith("file:///android_asset/")) return false;
                if (!request.isForMainFrame()) return true;
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                catch (Exception e) { Toast.makeText(MainActivity.this, "无法打开链接", Toast.LENGTH_SHORT).show(); }
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view,
                    ValueCallback<Uri[]> callback, FileChooserParams params) {
                // Never let an OEM documents-provider failure crash the whole editor.
                if (fileCallback != null) {
                    try { fileCallback.onReceiveValue(null); }
                    catch (RuntimeException ignored) { }
                }
                fileCallback = callback;
                String[] accept = params.getAcceptTypes();
                boolean imagesOnly = accept != null && accept.length > 0;
                if (imagesOnly) {
                    for (String type : accept) imagesOnly &= type != null && type.trim().startsWith("image/");
                }
                String mime = imagesOnly ? "image/*" : "*/*";
                try {
                    Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    picker.addCategory(Intent.CATEGORY_OPENABLE);
                    // System providers inconsistently support extension-based accept strings.
                    // The app validates file extensions after selection.
                    picker.setType(mime);
                    picker.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    picker.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);
                    startActivityForResult(picker, REQUEST_PICK_FILE);
                } catch (RuntimeException firstError) {
                    Log.w("StoryWeave", "ACTION_OPEN_DOCUMENT unavailable", firstError);
                    try {
                        Intent fallback = new Intent(Intent.ACTION_GET_CONTENT);
                        fallback.addCategory(Intent.CATEGORY_OPENABLE);
                        fallback.setType(mime);
                        fallback.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivityForResult(Intent.createChooser(fallback, imagesOnly ? "选择写作背景" : "选择文件"), REQUEST_PICK_FILE);
                    } catch (RuntimeException secondError) {
                        Log.e("StoryWeave", "Could not open document picker", secondError);
                        deliverFileSelection(null);
                        Toast.makeText(MainActivity.this,
                                "无法打开系统文件选择器，请检查文件管理器", Toast.LENGTH_LONG).show();
                    }
                }
                return true;
            }
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                Log.d("StoryWeaveWeb", message.message() + " (" + message.lineNumber() + ")");
                return true;
            }
        });
        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    /** Accessible only to the locally bundled app page; never navigate to remote pages. */
    private void applyWritingSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller == null) return;
            int bars = WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars();
            if (immersiveWriting) {
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(bars);
            } else {
                controller.show(bars);
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_DEFAULT);
            }
        } else {
            // Leave the window's adjustResize behavior available for the keyboard.
            View decor = getWindow().getDecorView();
            int flags = View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
            int current = decor.getSystemUiVisibility();
            decor.setSystemUiVisibility(immersiveWriting ? current | flags : current & ~flags);
        }
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && immersiveWriting) applyWritingSystemBars();
    }

    private void setEditorSystemBarPalette(boolean ink) {
        final int color = ink ? Color.rgb(32, 41, 37) : Color.rgb(246, 245, 240);
        getWindow().setStatusBarColor(color);
        getWindow().setNavigationBarColor(color);
        final View decor = getWindow().getDecorView();
        int flags = decor.getSystemUiVisibility();
        int lightIcons = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            lightIcons |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        decor.setSystemUiVisibility(ink ? (flags & ~lightIcons) : (flags | lightIcons));
    }

    private class StoryBridge {
        /** Fixed allowlisted palette names only. Called after the webpage changes view/theme. */
        @JavascriptInterface public void setSystemBarStyle(String scheme) {
            if (!"ink".equals(scheme) && !"paper".equals(scheme)) return;
            runOnUiThread(() -> {
                if (!isFinishing() && !isDestroyed()) setEditorSystemBarPalette("ink".equals(scheme));
            });
        }
        @JavascriptInterface public void setWritingFullscreen(boolean enabled) {
            runOnUiThread(() -> {
                if (webView == null || isFinishing() || isDestroyed() || immersiveWriting == enabled) return;
                immersiveWriting = enabled;
                applyWritingSystemBars();
            });
        }

        @JavascriptInterface public void shareBookText(String title, String text) {
            if (text == null || text.isEmpty() || text.length() > 250_000) return;
            runOnUiThread(() -> {
                Intent share = new Intent(Intent.ACTION_SEND);
                share.setType("text/plain");
                share.putExtra(Intent.EXTRA_SUBJECT, title);
                share.putExtra(Intent.EXTRA_TEXT, text);
                try {
                    startActivity(Intent.createChooser(share, "分享作品"));
                } catch (RuntimeException error) {
                    Toast.makeText(MainActivity.this, "无法打开分享，可先导出 TXT", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface public void copyChapterText(String text) {
            if (text == null || text.isEmpty() || text.length() > 250_000) return;
            runOnUiThread(() -> {
                try {
                    ClipboardManager clipboard = getSystemService(ClipboardManager.class);
                    if (clipboard == null) throw new IllegalStateException("Clipboard unavailable");
                    clipboard.setPrimaryClip(ClipData.newPlainText("叙境章节", text));
                    if (android.os.Build.VERSION.SDK_INT < 33) {
                        Toast.makeText(MainActivity.this, "已复制到剪贴板", Toast.LENGTH_SHORT).show();
                    }
                } catch (RuntimeException error) {
                    Toast.makeText(MainActivity.this, "复制失败，请在预览框长按复制", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface public String cloudKeyState(String base) {
            try { CloudAi.validateBase(base); return cloudAi.state(base); }
            catch (Exception error) { return "missing"; }
        }

        @JavascriptInterface public boolean saveCloudKey(String base, String key, boolean remember) {
            try { cloudAi.save(base, key, remember); return true; }
            catch (Exception error) { return false; }
        }

        @JavascriptInterface public void cloudAiRequest(String requestId, String base, String route,
                                                        String payload, String draftKey) {
            if (requestId == null || !requestId.matches("cloud[0-9]{1,12}")) return;
            boolean chat = "chat".equals(route);
            if ((!chat && !"models".equals(route)) || !CloudAi.validKey(draftKey) ||
                    (chat && (payload == null || payload.length() > 250_000))) {
                reportCloudAi(requestId, 0, "请求参数无效或正文超出上限");
                return;
            }
            cloudAiQueue.execute(() -> {
                HttpURLConnection connection = null;
                try {
                    CloudAi.validateBase(base);
                    String key;
                    try { key = draftKey.isEmpty() ? cloudAi.load(base) : draftKey; }
                    catch (Exception error) { reportCloudAi(requestId, 0, error.getMessage()); return; }
                    URL url = new URL(base + (chat ? "/chat/completions" : "/models"));
                    connection = (HttpURLConnection) url.openConnection();
                    connection.setInstanceFollowRedirects(false);
                    connection.setConnectTimeout(10000);
                    connection.setReadTimeout(chat ? 85000 : 15000);
                    connection.setUseCaches(false);
                    connection.setRequestProperty("Accept", "application/json");
                    if (!key.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + key);
                    if (chat) {
                        connection.setRequestMethod("POST");
                        connection.setDoOutput(true);
                        connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                        byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
                        connection.setFixedLengthStreamingMode(bytes.length);
                        try (OutputStream out = connection.getOutputStream()) { out.write(bytes); }
                    } else connection.setRequestMethod("GET");
                    int status = connection.getResponseCode();
                    String body = status >= 200 && status < 300 ? readLimited(connection.getInputStream(), 1_500_000) : "";
                    reportCloudAi(requestId, status, body);
                } catch (java.net.SocketTimeoutException error) {
                    reportCloudAi(requestId, 0, "服务商响应超时");
                } catch (Exception error) {
                    reportCloudAi(requestId, 0, "无法读取云端接口响应，请检查网络、HTTPS 地址与服务商状态");
                } finally { if (connection != null) connection.disconnect(); }
            });
        }

        /** IRIDIS runs inference ON THIS PHONE. No arbitrary hostname/URL is accepted. */
        @JavascriptInterface public void localAiRequest(String requestId, String route,
                                                       String payload, String apiKey) {
            if (requestId == null || !requestId.matches("sw[0-9]{1,12}")) return;
            final String path;
            if ("health".equals(route)) path = "/health";
            else if ("models".equals(route)) path = "/v1/models";
            else if ("chat".equals(route)) path = "/v1/chat/completions";
            else { reportLocalAi(requestId, false, "不支持的本地接口"); return; }
            if ("chat".equals(route) && (payload == null || payload.length() > 100_000)) {
                reportLocalAi(requestId, false, "本次输入太长，已拒绝发送"); return;
            }
            localAiQueue.execute(() -> {
                HttpURLConnection connection = null;
                try {
                    URL url = new URL("http://127.0.0.1:8686" + path);
                    connection = (HttpURLConnection) url.openConnection();
                    connection.setConnectTimeout(5000);
                    connection.setReadTimeout(175000);
                    connection.setUseCaches(false);
                    connection.setRequestProperty("Accept", "application/json");
                    connection.setRequestProperty("Connection", "close");
                    // Do not set Origin; native requests work with IRIDIS default loopback API.
                    if (apiKey != null && !apiKey.isEmpty() && apiKey.length() <= 256
                            && apiKey.indexOf('\r') == -1 && apiKey.indexOf('\n') == -1) {
                        connection.setRequestProperty("Authorization", "Bearer " + apiKey);
                    }
                    if ("chat".equals(route)) {
                        connection.setRequestMethod("POST");
                        connection.setDoOutput(true);
                        connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                        byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
                        connection.setFixedLengthStreamingMode(bytes.length);
                        try (OutputStream out = connection.getOutputStream()) { out.write(bytes); }
                    } else connection.setRequestMethod("GET");
                    int status = connection.getResponseCode();
                    InputStream stream = status >= 200 && status < 300
                            ? connection.getInputStream() : connection.getErrorStream();
                    String text = readLimited(stream, 1_500_000);
                    if (status >= 200 && status < 300) {
                        if ("health".equals(route) && !text.trim().startsWith("{"))
                            text = new JSONObject().put("status", text.trim()).toString();
                        else new JSONObject(text); // Require JSON for OpenAI-compatible endpoints.
                        reportLocalAi(requestId, true, text);
                    } else {
                        String reason = "IRIDIS 返回 HTTP " + status;
                        try {
                            JSONObject error = new JSONObject(text).optJSONObject("error");
                            if (error != null) reason += "：" + error.optString("message", "请求失败");
                        } catch (Exception ignored) { }
                        reportLocalAi(requestId, false, reason);
                    }
                } catch (Exception error) {
                    reportLocalAi(requestId, false,
                        "无法访问手机 IRIDIS：" + String.valueOf(error.getMessage()));
                } finally { if (connection != null) connection.disconnect(); }
            });
        }
    
        @JavascriptInterface public void saveText(String filename, String content, String mime) {
            runOnUiThread(() -> {
                pendingText = content;
                pendingMime = (mime == null || mime.isEmpty()) ? "text/plain" : mime.split(";")[0];
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(pendingMime);
                intent.putExtra(Intent.EXTRA_TITLE, filename);
                try { startActivityForResult(intent, REQUEST_SAVE_DOCUMENT); }
                catch (Exception e) {
                    pendingText = null;
                    Toast.makeText(MainActivity.this,"无法打开保存窗口", Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    private static String readLimited(InputStream in, int max) throws Exception {
        if (in == null) return "";
        try (InputStream source = in; ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
            byte[] tmp = new byte[8192]; int n;
            while ((n = source.read(tmp)) != -1) {
                if (buffer.size() + n > max) throw new Exception("模型返回内容超过安全上限");
                buffer.write(tmp, 0, n);
            }
            return buffer.toString("UTF-8");
        }
    }

    private void reportLocalAi(String requestId, boolean ok, String body) {
        runOnUiThread(() -> {
            if (webView == null) return;
            String script = "window.__storyLocalAiReceive(" + JSONObject.quote(requestId)
                    + "," + (ok ? "true" : "false") + "," + JSONObject.quote(body) + ");";
            webView.evaluateJavascript(script, null);
        });
    }

    private void reportCloudAi(String requestId, int status, String body) {
        runOnUiThread(() -> {
            if (webView == null) return;
            webView.evaluateJavascript("window.__storyCloudReceive?.(" + JSONObject.quote(requestId)
                + "," + status + "," + JSONObject.quote(body) + ");", null);
        });
    }

    private void deliverFileSelection(Uri[] uris) {
        ValueCallback<Uri[]> callback = fileCallback;
        fileCallback = null;
        if (callback != null) {
            try { callback.onReceiveValue(uris); }
            catch (RuntimeException error) { Log.w("StoryWeave", "File picker callback failed", error); }
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_PICK_FILE) {
            Uri selected = null;
            if (resultCode == RESULT_OK && data != null) {
                try {
                    selected = data.getData();
                    if (selected == null && data.getClipData() != null
                            && data.getClipData().getItemCount() > 0)
                        selected = data.getClipData().getItemAt(0).getUri();
                } catch (RuntimeException error) {
                    Log.w("StoryWeave", "Invalid picker response", error);
                }
            }
            deliverFileSelection(selected == null ? null : new Uri[]{selected});
        } else if (requestCode == REQUEST_SAVE_DOCUMENT) {
            String text = pendingText;
            pendingText = null;
            pendingMime = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && text != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                    if (out == null) throw new Exception("无法访问保存位置");
                    out.write(text.getBytes(StandardCharsets.UTF_8));
                    out.flush();
                    Toast.makeText(this,"文件已保存", Toast.LENGTH_SHORT).show();
                } catch (Exception ex) {
                    Toast.makeText(this,"保存失败：" + ex.getMessage(), Toast.LENGTH_LONG).show();
                }
            }
        }
    }

    @Override public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript("Boolean(window.StoryWeaveDesk && StoryWeaveDesk.back())", handled -> {
            if ("true".equals(handled) || isFinishing() || isDestroyed()) return;
            if (webView != null && webView.canGoBack()) webView.goBack();
            else super.onBackPressed();
        });
    }

    @Override protected void onDestroy() {
        deliverFileSelection(null);
        localAiQueue.shutdownNow();
        cloudAiQueue.shutdownNow();
        if (webView != null) { webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
