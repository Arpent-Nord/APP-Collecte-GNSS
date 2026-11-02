package com.arpentnord.collecte;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.WindowManager;
import android.webkit.ValueCallback;
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
    private static final int REQ_NOTIF = 3;
    private static final int REQ_OPEN = 4;

    private WebView web;
    private GnssBridge bridge;
    private String pendingContent;
    private ValueCallback<Uri[]> fileCallback;

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
        web.setWebChromeClient(new WebChromeClient() {   // boîtes de confirmation JS
            /** <input type="file"> : ouvre le sélecteur Android (reference.json depuis OneDrive, SharePoint, Téléchargements…). */
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try {
                    startActivityForResult(i, REQ_OPEN);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        bridge = new GnssBridge(this, web);
        web.addJavascriptInterface(bridge, "GnssNative");
        setContentView(web);
        web.loadUrl("file:///android_asset/www/index.html");

        if (!hasBluetoothPermission()) requestBluetoothPermission();
        else requestNotificationPermission();
    }

    // ------------------------------------------------------------------ Autorisations

    public boolean hasBluetoothPermission() {
        if (Build.VERSION.SDK_INT < 31) return true;
        return checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    public void requestBluetoothPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            // La notification du service de collecte est requise pour travailler écran éteint.
            requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.POST_NOTIFICATIONS}, REQ_BT);
        } else if (Build.VERSION.SDK_INT >= 31) {
            requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT}, REQ_BT);
        }
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
        }
    }

    // ------------------------------------------------------------------ Écran et batterie

    public void setKeepScreenOn(boolean on) {
        if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    /** Vrai si l'optimisation de la batterie s'applique encore à l'application. */
    public boolean batteryRestricted() {
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        return pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName());
    }

    @SuppressLint("BatteryLife") // application installée hors Play Store, outil de terrain
    public void requestBatteryExemption() {
        try {
            startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:" + getPackageName())));
        } catch (Exception e) {
            try {
                startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            } catch (Exception ignored) {
            }
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
        if (requestCode == REQ_OPEN) {
            ValueCallback<Uri[]> cb = fileCallback;
            fileCallback = null;
            if (cb != null) cb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            return;
        }
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
        // Le service de collecte continue sans l'interface ; « Déconnecter » ou la notification l'arrêtent.
        if (bridge != null) bridge.detach();
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
