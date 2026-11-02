package com.arpentnord.collecte;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.List;
import java.util.Set;

/**
 * Pont entre l'interface web (JavaScript) et Android.
 * JS -> Android : méthodes @JavascriptInterface de window.GnssNative.
 * Android -> JS : window.GnssApp.onNative({t: ...}).
 *
 * Le lien Bluetooth et le client NTRIP vivent dans GnssService (service au premier plan),
 * pour continuer quand l'écran est éteint. Le pont relaie seulement les commandes et les événements.
 */
@SuppressLint("MissingPermission")
public class GnssBridge implements GnssService.Sink {

    private final MainActivity activity;
    private final WebView web;
    private volatile boolean attached = true;

    public GnssBridge(MainActivity activity, WebView web) {
        this.activity = activity;
        this.web = web;
        GnssService.setSink(this);
    }

    // ------------------------------------------------------------------ JS -> Android

    @JavascriptInterface
    public String appVersion() {
        return BuildConfig.VERSION_NAME;
    }

    @JavascriptInterface
    public String listDevices() {
        JSONArray arr = new JSONArray();
        if (!activity.hasBluetoothPermission()) {
            activity.runOnUiThread(activity::requestBluetoothPermission);
            return arr.toString();
        }
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) return arr.toString();
        Set<BluetoothDevice> bonded = adapter.getBondedDevices();
        if (bonded == null) return arr.toString();
        for (BluetoothDevice d : bonded) {
            try {
                JSONObject o = new JSONObject();
                o.put("name", d.getName() != null ? d.getName() : "(sans nom)");
                o.put("address", d.getAddress());
                arr.put(o);
            } catch (JSONException ignored) {
            }
        }
        return arr.toString();
    }

    @JavascriptInterface
    public void connect(String address) {
        if (!activity.hasBluetoothPermission()) {
            activity.runOnUiThread(activity::requestBluetoothPermission);
            onBt("error", "Autorisation Bluetooth requise");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                GnssService.startAndConnect(activity, address);
            } catch (Exception e) {
                onBt("error", "Service de collecte impossible à démarrer : " + e.getMessage());
            }
        });
    }

    @JavascriptInterface
    public void disconnect() {
        GnssService s = GnssService.get();
        if (s != null) s.disconnect();
        else onBt("disconnected", "Déconnecté.");
    }

    /** Rejoue l'état du service (appelé au chargement de la page). Retourne l'adresse du récepteur relié, ou "". */
    @JavascriptInterface
    public String syncState() {
        GnssService s = GnssService.get();
        if (s == null) return "";
        s.syncState();
        String a = s.deviceAddress();
        return a == null ? "" : a;
    }

    /** Vrai : la position (GGA) est envoyée au serveur NTRIP par le service natif. */
    @JavascriptInterface
    public boolean nativeGga() {
        return true;
    }

    @JavascriptInterface
    public void ntripGgaEnabled(boolean on) {
        GnssService s = GnssService.get();
        if (s != null) s.setGgaToCaster(on);
    }

    @JavascriptInterface
    public void ntripStart(String host, int port, String mount, String user, String pass) {
        GnssService s = GnssService.get();
        if (s == null) {
            onNtrip("stopped", "Connecter d'abord le récepteur.", 0);
            return;
        }
        s.ntripStart(host, port, mount, user, pass);
    }

    @JavascriptInterface
    public void ntripSetAgent(String agent) {
        NtripClient.setAgent(agent);
    }

    @JavascriptInterface
    public void ntripStop() {
        GnssService s = GnssService.get();
        if (s != null) s.ntripStop();
    }

    @JavascriptInterface
    public void ntripGga(String gga) {
        GnssService s = GnssService.get();
        if (s != null) s.ntripGga(gga);
    }

    @JavascriptInterface
    public void ntripSourcetable(final String host, final int port, final String user, final String pass) {
        new Thread(() -> {
            JSONObject ev = new JSONObject();
            try {
                ev.put("t", "sourcetable");
                try {
                    List<NtripClient.Mount> mounts = NtripClient.sourcetable(host, port, user, pass);
                    JSONArray arr = new JSONArray();
                    for (NtripClient.Mount m : mounts) {
                        JSONObject o = new JSONObject();
                        o.put("name", m.name);
                        o.put("info", m.info);
                        arr.put(o);
                    }
                    ev.put("mounts", arr);
                } catch (Exception e) {
                    ev.put("error", e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
                }
            } catch (JSONException ignored) {
            }
            emit(ev);
        }, "ntrip-table").start();
    }

    @JavascriptInterface
    public void saveFile(String name, String mime, String content) {
        activity.runOnUiThread(() -> activity.saveFile(name, mime, content));
    }

    @JavascriptInterface
    public void openUrl(String url) {
        activity.runOnUiThread(() -> {
            try {
                activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignored) {
            }
        });
    }

    /** Garder l'écran allumé pendant que l'application est affichée. */
    @JavascriptInterface
    public void keepScreenOn(boolean on) {
        activity.runOnUiThread(() -> activity.setKeepScreenOn(on));
    }

    /** Vrai si Android peut limiter l'application quand l'écran est éteint (optimisation de la batterie active). */
    @JavascriptInterface
    public boolean batteryRestricted() {
        return activity.batteryRestricted();
    }

    /** Ouvre la demande Android pour exclure l'application de l'optimisation de la batterie. */
    @JavascriptInterface
    public void requestBatteryExemption() {
        activity.runOnUiThread(activity::requestBatteryExemption);
    }

    // ------------------------------------------------------------------ Android -> JS (GnssService.Sink)

    @Override
    public void onBt(String state, String msg) {
        JSONObject ev = new JSONObject();
        try {
            ev.put("t", "bt");
            ev.put("state", state);
            ev.put("msg", msg);
        } catch (JSONException ignored) {
        }
        emit(ev);
    }

    @Override
    public void onData(byte[] data, int len) {
        JSONObject ev = new JSONObject();
        try {
            ev.put("t", "data");
            ev.put("b64", Base64.encodeToString(data, 0, len, Base64.NO_WRAP));
        } catch (JSONException ignored) {
        }
        emit(ev);
    }

    @Override
    public void onNtrip(String state, String msg, long bytes) {
        JSONObject ev = new JSONObject();
        try {
            ev.put("t", "ntrip");
            ev.put("state", state);
            ev.put("msg", msg);
            ev.put("bytes", bytes);
        } catch (JSONException ignored) {
        }
        emit(ev);
    }

    @Override
    public void onStation(int id, double x, double y, double z) {
        JSONObject ev = new JSONObject();
        try {
            ev.put("t", "base");
            ev.put("id", id);
            ev.put("x", x);
            ev.put("y", y);
            ev.put("z", z);
        } catch (JSONException ignored) {
        }
        emit(ev);
    }

    public void onFileSaved(boolean ok, String msg) {
        JSONObject ev = new JSONObject();
        try {
            ev.put("t", "file");
            ev.put("ok", ok);
            ev.put("msg", msg == null ? "" : msg);
        } catch (JSONException ignored) {
        }
        emit(ev);
    }

    private void emit(JSONObject ev) {
        if (!attached) return;
        final String js = "window.GnssApp && window.GnssApp.onNative(" + ev.toString() + ")";
        web.post(() -> { if (attached) web.evaluateJavascript(js, null); });
    }

    /** L'activité se termine : on détache l'interface, le service continue (s'il est actif). */
    public void detach() {
        attached = false;
        GnssService.setSinkIf(this, null);
    }
}
