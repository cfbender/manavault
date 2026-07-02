package dev.cfb.manavault;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Log;

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
    private static final String TAG = "ManaVaultSharedImport";
    private static final int PENDING_IMPORT_READS = 2;
    private static final long PENDING_IMPORT_TTL_MS = 120_000L;


    private static JSObject pendingImport;
    private static int pendingImportReadsRemaining;
    private static long pendingImportCapturedAt;

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
            pruneExpiredPendingImport();
            payload = pendingImport;
            if (payload != null) {
                pendingImportReadsRemaining--;
                if (pendingImportReadsRemaining <= 0) clearPendingImport();
            }
        }

        if (payload != null) {
            result.put("import", payload);
        }

        call.resolve(result);
    }

    @PluginMethod
    public void hasPendingImport(PluginCall call) {
        JSObject result = new JSObject();

        synchronized (LOCK) {
            pruneExpiredPendingImport();
            result.put("pending", pendingImport != null);
        }

        call.resolve(result);
    }

    private static void pruneExpiredPendingImport() {
        if (pendingImport == null) return;
        if (System.currentTimeMillis() - pendingImportCapturedAt <= PENDING_IMPORT_TTL_MS) return;

        clearPendingImport();
    }

    private static void clearPendingImport() {
        pendingImport = null;
        pendingImportReadsRemaining = 0;
        pendingImportCapturedAt = 0L;
    }

    private void captureIntent(Activity activity, Intent intent, boolean notify) {
        logIntent(intent, notify);
        JSObject payload = payloadFromIntent(activity, intent);
        if (payload == null) {
            debug("No shared import payload captured");
            return;
        }
        debug("Captured shared import payload source=" + payload.optString("source")
                + " fileName=" + payload.optString("fileName")
                + " mimeType=" + payload.optString("mimeType")
                + " textLength=" + payload.optString("text").length());

        synchronized (LOCK) {
            pendingImport = payload;
            pendingImportReadsRemaining = PENDING_IMPORT_READS;
            pendingImportCapturedAt = System.currentTimeMillis();
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

        JSObject streamPayload = payloadFromFirstTextUri(context, intent);
        if (streamPayload != null) return streamPayload;

        String text = firstSharedText(context, intent);
        if (text == null) return null;

        Uri link = linkFromSharedText(context, text);
        if (link != null) return linkPayload(link.toString(), "android-share");

        return importPayload(text, "Shared list.txt", intent.getType(), "android-share");
    }

    private JSObject payloadFromViewIntent(Context context, Intent intent) {
        Uri data = intent.getData();
        if (data == null) data = firstStreamUri(context, intent);

        if (isManaVaultLink(context, data)) return linkPayload(data.toString(), "android-view");
        if (!isReadableContentUri(data)) return null;

        ContentResolver resolver = context.getContentResolver();
        String intentMimeType = intent.getType();
        String resolvedMimeType = resolverMimeType(resolver, data);
        String intentType = normalizeMimeType(intentMimeType);
        String resolverType = normalizeMimeType(resolvedMimeType);
        boolean supportedType = isSupportedTextFileMimeType(intentType) || isSupportedTextFileMimeType(resolverType);

        if (!supportedType && !hasTextFileExtension(data.getLastPathSegment())) {
            supportedType = hasTextFileExtension(queryDisplayName(resolver, data));
        }
        if (!supportedType) return null;

        String text = readText(resolver, data);
        if (text == null || text.trim().isEmpty()) return null;

        return importPayload(
                text,
                displayName(resolver, data),
                bestMimeType(intentMimeType, resolvedMimeType),
                "android-view-file"
        );
    }

    // Only content:// URIs, which carry an explicit read grant from the sender.
    // file:// URIs carry no grant and were the vector for reading arbitrary
    // app-readable paths supplied as shared text, so they are no longer honored.
    private boolean isReadableContentUri(Uri uri) {
        if (uri == null) return false;

        return "content".equalsIgnoreCase(uri.getScheme());
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

    private String bestMimeType(String intentMimeType, String resolverMimeType) {
        if (isSupportedTextFileMimeType(normalizeMimeType(intentMimeType))) return intentMimeType;
        if (isSupportedTextFileMimeType(normalizeMimeType(resolverMimeType))) return resolverMimeType;
        if (intentMimeType != null && !intentMimeType.trim().isEmpty()) return intentMimeType;
        return resolverMimeType;
    }

    @SuppressWarnings("deprecation")
    private JSObject payloadFromFirstTextUri(Context context, Intent intent) {
        ContentResolver resolver = context.getContentResolver();

        ArrayList<Uri> uris = streamUris(context, intent);
        debug("Shared import URI candidates=" + uris.size());

        for (Uri streamUri : uris) {
            debug("Trying shared URI " + describeUri(streamUri)
                    + " name=" + queryDisplayName(resolver, streamUri)
                    + " mimeType=" + resolverMimeType(resolver, streamUri));
            String text = readText(resolver, streamUri);
            debug("Read shared URI " + describeUri(streamUri)
                    + " textLength=" + (text == null ? "null" : text.length()));
            if (text == null || text.trim().isEmpty()) continue;

            Uri link = linkFromSharedText(context, text);
            if (link != null) return linkPayload(link.toString(), "android-share");

            return importPayload(
                    text,
                    displayName(resolver, streamUri),
                    bestMimeType(intent.getType(), resolverMimeType(resolver, streamUri)),
                    "android-share"
            );
        }

        return null;
    }

    @SuppressWarnings("deprecation")
    private ArrayList<Uri> streamUris(Context context, Intent intent) {
        ArrayList<Uri> uris = new ArrayList<>();
        if (intent == null) return uris;

        addUri(uris, intent.getData());
        addStreamExtraUris(uris, intent);

        ClipData clipData = intent.getClipData();
        debug("Shared import clip item count=" + (clipData == null ? 0 : clipData.getItemCount()));
        if (clipData != null) {
            for (int index = 0; index < clipData.getItemCount(); index++) {
                addClipItemUris(uris, clipData.getItemAt(index));
            }
        }

        return uris;
    }

    private Uri firstStreamUri(Context context, Intent intent) {
        ArrayList<Uri> uris = streamUris(context, intent);
        return uris.isEmpty() ? null : uris.get(0);
    }

    private void addClipItemUris(ArrayList<Uri> uris, ClipData.Item item) {
        if (item == null) return;

        addUri(uris, item.getUri());

        Intent nestedIntent = item.getIntent();
        if (nestedIntent != null) {
            addUri(uris, nestedIntent.getData());
            addStreamExtraUris(uris, nestedIntent);
        }
    }

    private void addStreamExtraUris(ArrayList<Uri> uris, Intent intent) {
        Bundle extras = intent.getExtras();
        Object stream = extras == null ? null : extras.get(Intent.EXTRA_STREAM);

        if (stream instanceof Uri) {
            addUri(uris, (Uri) stream);
            return;
        }

        if (stream instanceof Iterable<?>) {
            for (Object value : (Iterable<?>) stream) {
                if (value instanceof Uri) addUri(uris, (Uri) value);
            }
            return;
        }

        if (stream instanceof Object[]) {
            for (Object value : (Object[]) stream) {
                if (value instanceof Uri) addUri(uris, (Uri) value);
            }
        }
    }

    private void addUri(ArrayList<Uri> uris, Uri uri) {
        if (uri == null) return;
        if (!isReadableContentUri(uri)) {
            debug("Ignoring non-content shared URI " + describeUri(uri));
            return;
        }
        if (uris.contains(uri)) return;
        debug("Found shared URI " + describeUri(uri));
        uris.add(uri);
    }

    private String firstSharedText(Context context, Intent intent) {
        String extraText = nonBlank(intent.getCharSequenceExtra(Intent.EXTRA_TEXT));
        if (extraText != null) return extraText;

        ClipData clipData = intent.getClipData();
        if (clipData == null) return null;

        for (int index = 0; index < clipData.getItemCount(); index++) {
            ClipData.Item item = clipData.getItemAt(index);
            String text = nonBlank(item.getText());
            if (text != null) return text;

            try {
                text = nonBlank(item.coerceToText(context));
                if (text != null) return text;
            } catch (SecurityException ignored) {
                // Some providers expose URI clips without granting text coercion access.
            }
        }

        return null;
    }

    private String nonBlank(CharSequence value) {
        if (value == null) return null;

        String text = value.toString();
        return text.trim().isEmpty() ? null : text;
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
            if (input == null) {
                debug("openInputStream returned null for " + describeUri(uri));
                return null;
            }

            byte[] buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = input.read(buffer)) != -1) {
                output.write(buffer, 0, bytesRead);
            }

            return output.toString(StandardCharsets.UTF_8.name());
        } catch (IOException | SecurityException e) {
            debug("Failed reading " + describeUri(uri) + ": " + e.getClass().getSimpleName() + ": " + e.getMessage());
            return null;
        }
    }

    private void logIntent(Intent intent, boolean notify) {
        if (!diagnosticLoggingEnabled()) return;
        if (intent == null) {
            debug("Capture intent notify=" + notify + " intent=null");
            return;
        }

        Bundle extras = intent.getExtras();
        ClipData clipData = intent.getClipData();
        debug("Capture intent notify=" + notify
                + " action=" + intent.getAction()
                + " type=" + intent.getType()
                + " data=" + describeUri(intent.getData())
                + " extras=" + (extras == null ? "[]" : extras.keySet())
                + " clipItems=" + (clipData == null ? 0 : clipData.getItemCount()));
    }

    private String describeUri(Uri uri) {
        if (uri == null) return "null";

        String scheme = uri.getScheme();
        String authority = uri.getAuthority();
        String path = uri.getPath();
        return (scheme == null ? "" : scheme + "://")
                + (authority == null ? "" : authority)
                + (path == null ? "" : path);
    }

    private boolean diagnosticLoggingEnabled() {
        return (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private void debug(String message) {
        if (diagnosticLoggingEnabled()) Log.i(TAG, message);
    }

    private String displayName(ContentResolver resolver, Uri uri) {
        String displayName = queryDisplayName(resolver, uri);
        if (displayName != null) return displayName;

        String path = uri.getLastPathSegment();
        return path == null || path.trim().isEmpty() ? "Shared list.txt" : path;
    }

    private String queryDisplayName(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) {
                    String value = cursor.getString(index);
                    if (value != null && !value.trim().isEmpty()) return value;
                }
            }
        } catch (SecurityException e) {
            return null;
        }

        return null;
    }
}
