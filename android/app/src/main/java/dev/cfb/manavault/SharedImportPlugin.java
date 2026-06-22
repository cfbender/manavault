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

@CapacitorPlugin(name = "SharedImport")
public class SharedImportPlugin extends Plugin {
    private static final Object LOCK = new Object();

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
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return null;

        Uri streamUri = firstStreamUri(intent);
        if (streamUri != null) {
            String text = readText(context.getContentResolver(), streamUri);
            if (text == null || text.trim().isEmpty()) return null;

            return payload(
                    text,
                    displayName(context.getContentResolver(), streamUri),
                    context.getContentResolver().getType(streamUri),
                    "android-share"
            );
        }

        CharSequence extraText = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (extraText == null || extraText.toString().trim().isEmpty()) return null;

        return payload(extraText.toString(), "Shared list.txt", intent.getType(), "android-share");
    }

    @SuppressWarnings("deprecation")
    private Uri firstStreamUri(Intent intent) {
        Object stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (stream instanceof Uri) return (Uri) stream;

        ArrayList<Uri> streams = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
        if (streams == null || streams.isEmpty()) return null;

        return streams.get(0);
    }

    private JSObject payload(String text, String fileName, String mimeType, String source) {
        JSObject payload = new JSObject();
        payload.put("text", text);
        payload.put("fileName", fileName);
        payload.put("mimeType", mimeType);
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
