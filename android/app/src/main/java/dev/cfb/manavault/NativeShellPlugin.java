package dev.cfb.manavault;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeShell")
public class NativeShellPlugin extends Plugin {
    private static final String PREFERENCES_NAME = "NativeShell";
    private static final String SERVER_URL_KEY = "serverUrl";
    private static final String RELEASE_REPOSITORY = "cfbender/manavault";
    private static final String FALLBACK_VERSION = "0.0.0";

    @PluginMethod
    public void getSettings(PluginCall call) {
        call.resolve(settingsPayload());
    }

    @PluginMethod
    public void saveServer(PluginCall call) {
        String serverUrl = call.getString("serverUrl", "").trim();
        if (serverUrl.isEmpty()) {
            call.reject("Enter a ManaVault URL.");
            return;
        }

        preferences().edit().putString(SERVER_URL_KEY, serverUrl).apply();
        call.resolve(settingsPayload());
    }

    @PluginMethod
    public void clearServer(PluginCall call) {
        preferences().edit().remove(SERVER_URL_KEY).apply();
        call.resolve(settingsPayload());
    }

    private JSObject settingsPayload() {
        JSObject payload = new JSObject();
        String serverUrl = preferences().getString(SERVER_URL_KEY, "");
        if (serverUrl != null && !serverUrl.trim().isEmpty()) {
            payload.put("serverUrl", serverUrl.trim());
        }
        payload.put("appVersion", appVersion());
        payload.put("releaseRepository", RELEASE_REPOSITORY);
        return payload;
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE);
    }

    private String appVersion() {
        try {
            PackageManager packageManager = getContext().getPackageManager();
            PackageInfo packageInfo = packageManager.getPackageInfo(getContext().getPackageName(), 0);
            return packageInfo.versionName == null ? FALLBACK_VERSION : packageInfo.versionName;
        } catch (PackageManager.NameNotFoundException _error) {
            return FALLBACK_VERSION;
        }
    }
}
