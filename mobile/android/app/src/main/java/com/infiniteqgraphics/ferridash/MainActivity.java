package com.infiniteqgraphics.ferridash;

import android.content.Context;
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
    }
}
