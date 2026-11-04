package dev.cfb.manavault;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebView;

import java.util.Locale;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.CapConfig;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.WebViewListener;
import com.getcapacitor.annotation.CapacitorPlugin;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private static final int APP_CHROME_COLOR = Color.rgb(24, 4, 13);
    private static final String PREFERENCES_NAME = "NativeShell";
    private static final String SERVER_URL_KEY = "serverUrl";

    /** System bar and cutout insets in px; the page receives them as CSS variables. */
    private Insets safeArea = Insets.NONE;


    @Override
    protected void onCreate(Bundle savedInstanceState) {
        String serverUrl = savedServerUrl();
        if (serverUrl != null) {
            config = new CapConfig.Builder(this)
                    .setServerUrl(serverUrl)
                    .create();
        }
        registerPlugin(InAppHttpNavigationPlugin.class);
        registerPlugin(SharedImportPlugin.class);
        registerPlugin(NativeShellPlugin.class);
        // Edge to edge on every Android version (Android 15+ enforces it anyway): page
        // backgrounds run behind transparent system bars and the page pads its own content.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);

        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);

        passSafeAreaToPage();
    }

    /**
     * The page draws under the system bars and reads their size from --safe-area-inset-*
     * (assets/css/app.css takes the larger of that and env()), which this sets after every
     * insets change and page load. Capacitor's own SystemBars CSS handling is disabled in
     * capacitor.config.json because it left those variables at 0 on some devices. Only the
     * on-screen keyboard shrinks the WebView.
     */
    private void passSafeAreaToPage() {
        WebView webView = getBridge().getWebView();
        View container = (View) webView.getParent();
        container.setBackgroundColor(APP_CHROME_COLOR);
        ViewCompat.setOnApplyWindowInsetsListener(container, (view, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            boolean keyboard = insets.isVisible(WindowInsetsCompat.Type.ime());
            int keyboardHeight = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;
            int bottomPadding = keyboard ? keyboardHeight : 0;
            view.setPadding(0, 0, 0, bottomPadding);
            safeArea = Insets.of(bars.left, bars.top, bars.right, keyboard ? 0 : bars.bottom);
            injectSafeArea(webView);
            // WebView M139+ also shrinks its viewport by the IME inset it receives; hand it the
            // insets minus the padding above so the keyboard is not subtracted twice.
            return insets.inset(0, 0, 0, bottomPadding);
        });
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageCommitVisible(WebView view, String url) {
                injectSafeArea(view);
            }

            @Override
            public void onPageLoaded(WebView view) {
                injectSafeArea(view);
            }
        });
        ViewCompat.requestApplyInsets(container);
    }

    private void injectSafeArea(WebView webView) {
        float density = getResources().getDisplayMetrics().density;
        String script = String.format(
                Locale.US,
                "(function(s){s.setProperty('--safe-area-inset-top','%.1fpx');"
                        + "s.setProperty('--safe-area-inset-right','%.1fpx');"
                        + "s.setProperty('--safe-area-inset-bottom','%.1fpx');"
                        + "s.setProperty('--safe-area-inset-left','%.1fpx');})"
                        + "(document.documentElement.style)",
                safeArea.top / density,
                safeArea.right / density,
                safeArea.bottom / density,
                safeArea.left / density);
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    @Override
    public void onPause() {
        flushWebViewCookies();
        super.onPause();
    }

    @Override
    public void onStop() {
        flushWebViewCookies();
        super.onStop();
    }

    private void flushWebViewCookies() {
        CookieManager.getInstance().flush();
    }

    private String savedServerUrl() {
        String serverUrl = getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
                .getString(SERVER_URL_KEY, "");
        if (serverUrl == null) return null;

        String trimmed = serverUrl.trim();
        if (trimmed.isEmpty()) return null;

        Uri uri = Uri.parse(trimmed);
        String scheme = uri.getScheme();
        if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) return null;

        return trimmed;
    }

    @CapacitorPlugin(name = "InAppHttpNavigation")
    public static final class InAppHttpNavigationPlugin extends Plugin {
        @Override
        public Boolean shouldOverrideLoad(Uri url) {
            String scheme = url.getScheme();

            if ("http".equals(scheme) || "https".equals(scheme)) {
                if (isAppNavigation(url)) return false;

                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, url);
                    intent.addCategory(Intent.CATEGORY_BROWSABLE);
                    getActivity().startActivity(intent);
                } catch (ActivityNotFoundException exception) {
                    Log.w(TAG, "No browser available to open external URL", exception);
                    return true;
                }

                return true;
            }

            return null;
        }

        private boolean isAppNavigation(Uri url) {
            String host = url.getHost();
            if ("manavault.cfb.dev".equalsIgnoreCase(host) || "www.manavault.cfb.dev".equalsIgnoreCase(host)) {
                return true;
            }

            String serverUrl = getContext()
                    .getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
                    .getString(SERVER_URL_KEY, "");
            if (serverUrl.trim().isEmpty()) return false;

            Uri serverUri = Uri.parse(serverUrl.trim());
            return sameOrigin(url, serverUri);
        }

        private boolean sameOrigin(Uri left, Uri right) {
            int leftPort = effectivePort(left);
            int rightPort = effectivePort(right);

            return leftPort == rightPort
                    && stringEqualsIgnoreCase(left.getScheme(), right.getScheme())
                    && stringEqualsIgnoreCase(left.getHost(), right.getHost());
        }

        private int effectivePort(Uri uri) {
            int port = uri.getPort();
            if (port >= 0) return port;

            String scheme = uri.getScheme();
            if ("http".equalsIgnoreCase(scheme)) return 80;
            if ("https".equalsIgnoreCase(scheme)) return 443;
            return -1;
        }

        private boolean stringEqualsIgnoreCase(String left, String right) {
            if (left == null || right == null) return left == null && right == null;
            return left.equalsIgnoreCase(right);
        }
    }
}
