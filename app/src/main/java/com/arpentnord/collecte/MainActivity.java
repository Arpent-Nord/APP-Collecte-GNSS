package com.arpentnord.collecte;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Écran unique : l'interface web (assets/www) dans une WebView, reliée au module natif. */
public class MainActivity extends Activity {

    private static final int REQ_BT = 1;
    private static final int REQ_SAVE = 2;

    private WebView web;
    private GnssBridge bridge;
    private String pendingContent;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);          // localStorage : réglages et points sur l'appareil
        ws.setAllowFileAccess(true);
        ws.setMediaPlaybackRequiresUserGesture(true);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient()); // boîtes de confirmation JS

        bridge = new GnssBridge(this, web);
        web.addJavascriptInterface(bridge, "GnssNative");
        setContentView(web);
        web.loadUrl("file:///android_asset/www/index.html");

        if (!hasBluetoothPermission()) requestBluetoothPermission();
    }

    // ------------------------------------------------------------------ Autorisations

    public boolean hasBluetoothPermission() {
        if (Build.VERSION.SDK_INT < 31) return true;
        return checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    public void requestBluetoothPermission() {
        if (Build.VERSION.SDK_INT >= 31) {
            requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT}, REQ_BT);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_BT && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            // Recharger la liste des appareils appariés dans l'interface.
            web.evaluateJavascript("document.getElementById('btnRefresh') && document.getElementById('btnRefresh').click()", null);
        }
    }

    // ------------------------------------------------------------------ Enregistrement de fichiers

    /** Ouvre le sélecteur Android : l'utilisateur choisit le dossier (Téléchargements, OneDrive, SharePoint…). */
    public void saveFile(String name, String mime, String content) {
        pendingContent = content;
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(mime == null || mime.isEmpty() ? "text/plain" : mime);
        i.putExtra(Intent.EXTRA_TITLE, name);
        try {
            startActivityForResult(i, REQ_SAVE);
        } catch (Exception e) {
            bridge.onFileSaved(false, "Aucun gestionnaire de fichiers disponible");
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_SAVE) return;
        String content = pendingContent;
        pendingContent = null;
        if (resultCode != RESULT_OK || data == null || data.getData() == null || content == null) {
            bridge.onFileSaved(false, "");
            return;
        }
        Uri uri = data.getData();
        try (OutputStream os = getContentResolver().openOutputStream(uri)) {
            if (os == null) throw new IllegalStateException("flux indisponible");
            os.write(new byte[]{(byte) 0xEF, (byte) 0xBB, (byte) 0xBF}); // BOM UTF-8 pour Excel
            os.write(content.getBytes(StandardCharsets.UTF_8));
            bridge.onFileSaved(true, "");
        } catch (Exception e) {
            bridge.onFileSaved(false, e.getMessage());
        }
    }

    // ------------------------------------------------------------------ Cycle de vie

    @Override
    public void onBackPressed() {
        // Ne pas fermer l'application par erreur : on la met en arrière-plan.
        moveTaskToBack(true);
    }

    @Override
    protected void onDestroy() {
        if (bridge != null) bridge.shutdown();
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
