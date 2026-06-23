package dev.cfb.manavault;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Locale;

@CapacitorPlugin(name = "SharedImport")
public class SharedImportPlugin extends Plugin {
    private static final Object LOCK = new Object();
    private static final String APP_LINK_HOST = "manavault.cfb.dev";
    private static final String WWW_APP_LINK_HOST = "www.manavault.cfb.dev";
    private static final String APP_SCHEME = "manavault";

    private static final String PREFERENCES_NAME = "NativeShell";
    private static final String SERVER_URL_KEY = "serverUrl";

    private static JSObject pendingImport;

    @Override
    public void load() {
        captureIntent(getActivity(), getActivity().getIntent(), false);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        captureIntent(getActivity(), intent, true);
    }

    @PluginMethod
    public void getPendingImport(PluginCall call) {
        JSObject result = new JSObject();
        JSObject payload;

        synchronized (LOCK) {
            payload = pendingImport;
            pendingImport = null;
        }

        if (payload != null) {
            result.put("import", payload);
        }

        call.resolve(result);
    }

    private void captureIntent(Activity activity, Intent intent, boolean notify) {
        JSObject payload = payloadFromIntent(activity, intent);
        if (payload == null) return;

        synchronized (LOCK) {
            pendingImport = payload;
        }

        activity.setIntent(new Intent(Intent.ACTION_MAIN));

        if (notify) {
            notifyListeners("sharedImport", payload, true);
        }
    }

    private JSObject payloadFromIntent(Context context, Intent intent) {
        if (intent == null) return null;

        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action)) {
            return payloadFromViewIntent(context, intent);
        }

        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return null;

        Uri streamUri = firstStreamUri(intent);
        if (streamUri != null) {
            String text = readText(context.getContentResolver(), streamUri);
            if (text == null || text.trim().isEmpty()) return null;

            Uri link = linkFromSharedText(context, text);
            if (link != null) return linkPayload(link.toString(), "android-share");

            return importPayload(
                    text,
                    displayName(context.getContentResolver(), streamUri),
                    context.getContentResolver().getType(streamUri),
                    "android-share"
            );
        }

        CharSequence extraText = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (extraText == null || extraText.toString().trim().isEmpty()) return null;

        String text = extraText.toString();
        Uri link = linkFromSharedText(context, text);
        if (link != null) return linkPayload(link.toString(), "android-share");

        return importPayload(text, "Shared list.txt", intent.getType(), "android-share");
    }

    private JSObject payloadFromViewIntent(Context context, Intent intent) {
        Uri data = intent.getData();
        if (isManaVaultLink(context, data)) return linkPayload(data.toString(), "android-view");
        if (!isViewFileUri(data)) return null;

        ContentResolver resolver = context.getContentResolver();
        String intentType = normalizeMimeType(intent.getType());
        String resolverType = normalizeMimeType(resolverMimeType(resolver, data));
        boolean supportedType = isSupportedTextFileMimeType(intentType) || isSupportedTextFileMimeType(resolverType);

        String fileName = null;
        if (!supportedType && !hasTextFileExtension(data.getLastPathSegment())) {
            fileName = displayName(resolver, data);
            supportedType = hasTextFileExtension(fileName);
        }
        if (!supportedType) return null;

        String text = readText(resolver, data);
        if (text == null || text.trim().isEmpty()) return null;

        if (fileName == null) fileName = displayName(resolver, data);
        return importPayload(text, fileName, bestMimeType(intentType, resolverType), "android-view-file");
    }

    private boolean isViewFileUri(Uri uri) {
        if (uri == null) return false;

        String scheme = uri.getScheme();
        return "content".equalsIgnoreCase(scheme) || "file".equalsIgnoreCase(scheme);
    }

    private String resolverMimeType(ContentResolver resolver, Uri uri) {
        try {
            return resolver.getType(uri);
        } catch (SecurityException e) {
            return null;
        }
    }

    private String normalizeMimeType(String mimeType) {
        if (mimeType == null) return null;

        String normalized = mimeType.trim().toLowerCase(Locale.ROOT);
        int parameters = normalized.indexOf(';');
        return parameters >= 0 ? normalized.substring(0, parameters).trim() : normalized;
    }

    private boolean isSupportedTextFileMimeType(String mimeType) {
        if (mimeType == null || mimeType.trim().isEmpty()) return false;

        return mimeType.startsWith("text/")
                || "application/csv".equals(mimeType)
                || "application/vnd.ms-excel".equals(mimeType);
    }

    private boolean hasTextFileExtension(String value) {
        if (value == null) return false;

        String lower = value.trim().toLowerCase(Locale.ROOT);
        return lower.endsWith(".txt") || lower.endsWith(".csv");
    }

    private String bestMimeType(String intentType, String resolverType) {
        if (isSupportedTextFileMimeType(intentType)) return intentType;
        if (isSupportedTextFileMimeType(resolverType)) return resolverType;
        if (intentType != null && !intentType.trim().isEmpty()) return intentType;
        return resolverType;
    }

    @SuppressWarnings("deprecation")
    private Uri firstStreamUri(Intent intent) {
        Object stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (stream instanceof Uri) return (Uri) stream;

        ArrayList<Uri> streams = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
        if (streams == null || streams.isEmpty()) return null;

        return streams.get(0);
    }

    private Uri linkFromSharedText(Context context, String text) {
        String trimmed = text.trim();
        int newline = trimmed.indexOf('\n');
        String candidate = newline >= 0 ? trimmed.substring(0, newline).trim() : trimmed;
        Uri uri = Uri.parse(candidate);

        return isManaVaultLink(context, uri) ? uri : null;
    }

    private boolean isManaVaultLink(Context context, Uri uri) {
        if (uri == null) return false;

        String scheme = uri.getScheme();
        if (scheme == null) return false;
        if (APP_SCHEME.equalsIgnoreCase(scheme)) return true;
        if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) return false;

        String host = uri.getHost();
        if (host == null || host.trim().isEmpty()) return false;

        if ("https".equalsIgnoreCase(scheme)
                && effectivePort(uri) == 443
                && (APP_LINK_HOST.equalsIgnoreCase(host) || WWW_APP_LINK_HOST.equalsIgnoreCase(host))) {
            return true;
        }

        String serverUrl = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
                .getString(SERVER_URL_KEY, "");
        if (serverUrl == null || serverUrl.trim().isEmpty()) return false;

        Uri serverUri = Uri.parse(serverUrl.trim());
        return sameHttpOrigin(uri, serverUri);
    }

    private boolean sameHttpOrigin(Uri first, Uri second) {
        String firstScheme = first.getScheme();
        String secondScheme = second.getScheme();
        if (firstScheme == null || secondScheme == null) return false;
        if (!firstScheme.equalsIgnoreCase(secondScheme)) return false;
        if (!"http".equalsIgnoreCase(firstScheme) && !"https".equalsIgnoreCase(firstScheme)) return false;

        String firstHost = first.getHost();
        String secondHost = second.getHost();
        if (firstHost == null || secondHost == null) return false;
        if (!firstHost.equalsIgnoreCase(secondHost)) return false;

        return effectivePort(first) == effectivePort(second);
    }

    private int effectivePort(Uri uri) {
        int port = uri.getPort();
        if (port >= 0) return port;

        String scheme = uri.getScheme();
        if ("http".equalsIgnoreCase(scheme)) return 80;
        if ("https".equalsIgnoreCase(scheme)) return 443;
        return -1;
    }

    private JSObject importPayload(String text, String fileName, String mimeType, String source) {
        JSObject payload = new JSObject();
        payload.put("text", text);
        payload.put("fileName", fileName);
        payload.put("mimeType", mimeType);
        payload.put("source", source);
        return payload;
    }

    private JSObject linkPayload(String url, String source) {
        JSObject payload = new JSObject();
        payload.put("url", url);
        payload.put("source", source);
        return payload;
    }

    private String readText(ContentResolver resolver, Uri uri) {
        try (InputStream input = resolver.openInputStream(uri);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) return null;

            byte[] buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = input.read(buffer)) != -1) {
                output.write(buffer, 0, bytesRead);
            }

            return output.toString(StandardCharsets.UTF_8.name());
        } catch (IOException | SecurityException e) {
            return null;
        }
    }

    private String displayName(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) {
                    String value = cursor.getString(index);
                    if (value != null && !value.trim().isEmpty()) return value;
                }
            }
        } catch (SecurityException e) {
            return uri.getLastPathSegment();
        }

        String path = uri.getLastPathSegment();
        return path == null || path.trim().isEmpty() ? "Shared list.txt" : path;
    }
}
