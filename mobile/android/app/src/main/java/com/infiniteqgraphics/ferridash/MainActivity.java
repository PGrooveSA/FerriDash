package com.infiniteqgraphics.ferridash;

import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Android's WebView ignores window.print(). FerriDash pages call
        // FerriDashNative.print(name, paper) instead, which opens the system print dialog
        // (with "Save as PDF") for the current page, using its print styles.
        // The start screen also uses it for push notification setup (hasPush, openNotificationSettings).
        getBridge().getWebView().addJavascriptInterface(new PrintBridge(), "FerriDashNative");
    }

    private class PrintBridge {
        @JavascriptInterface
        public void print(final String jobName, final String paper) {
            runOnUiThread(() -> {
                WebView webView = getBridge().getWebView();
                PrintManager printManager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                String name = jobName == null || jobName.isEmpty() ? "FerriDash" : jobName;
                PrintAttributes attributes = new PrintAttributes.Builder()
                    .setMediaSize("A5".equals(paper) ? PrintAttributes.MediaSize.ISO_A5 : PrintAttributes.MediaSize.ISO_A4)
                    .build();
                printManager.print(name, webView.createPrintDocumentAdapter(name), attributes);
            });
        }

        /** True when the build includes google-services.json (Firebase): without it, registering for push would crash. */
        @JavascriptInterface
        public boolean hasPush() {
            return getResources().getIdentifier("google_app_id", "string", getPackageName()) != 0;
        }

        /** Opens FerriDash's notification settings, so someone who said no can switch them on. */
        @JavascriptInterface
        public void openNotificationSettings() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            });
        }
    }
}
