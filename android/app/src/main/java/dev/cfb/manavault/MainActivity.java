package dev.cfb.manavault;

import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

public class MainActivity extends BridgeActivity {
    private static final int APP_CHROME_COLOR = Color.rgb(24, 4, 13);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(InAppHttpNavigationPlugin.class);
        registerPlugin(SharedImportPlugin.class);
        registerPlugin(NativeShellPlugin.class);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(APP_CHROME_COLOR);
        getWindow().setNavigationBarColor(APP_CHROME_COLOR);

        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);
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

    @CapacitorPlugin(name = "InAppHttpNavigation")
    public static final class InAppHttpNavigationPlugin extends Plugin {
        @Override
        public Boolean shouldOverrideLoad(Uri url) {
            String scheme = url.getScheme();

            if ("http".equals(scheme) || "https".equals(scheme)) {
                return false;
            }

            return null;
        }
    }
}
