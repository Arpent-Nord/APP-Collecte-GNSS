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
 */
@SuppressLint("MissingPermission")
public class GnssBridge implements BluetoothLink.Listener, NtripClient.Listener {

    private final MainActivity activity;
    private final WebView web;
    private final BluetoothLink link;
    private final NtripClient ntrip;

    public GnssBridge(MainActivity activity, WebView web) {
        this.activity = activity;
        this.web = web;
        this.link = new BluetoothLink(this);
        this.ntrip = new NtripClient(this);
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
            onState("error", "Autorisation Bluetooth requise");
            return;
        }
        link.connect(address);
    }

    @JavascriptInterface
    public void disconnect() {
        ntrip.stop();
        link.disconnect();
        onState("disconnected", "Déconnecté.");
    }

    @JavascriptInterface
    public void ntripStart(String host, int port, String mount, String user, String pass) {
        ntrip.start(host, port, mount, user, pass);
    }

    @JavascriptInterface
    public void ntripStop() {
        ntrip.stop();
    }

    @JavascriptInterface
    public void ntripGga(String gga) {
        ntrip.sendGga(gga);
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

    // ------------------------------------------------------------------ Android -> JS

    @Override
    public void onState(String state, String msg) {
        JSONObject ev = new JSONObject();
        try {
            ev.put("t", "bt");
            ev.put("state", state);
            ev.put("msg", msg);
        } catch (JSONException ignored) {
        }
        emit(ev);
        if ("disconnected".equals(state) || "error".equals(state)) ntrip.stop();
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
    public void onState(String state, String msg, long bytes) {
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
    public void onCorrections(byte[] data, int off, int len) {
        link.write(data, off, len);
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
        final String js = "window.GnssApp && window.GnssApp.onNative(" + ev.toString() + ")";
        web.post(() -> web.evaluateJavascript(js, null));
    }

    public void shutdown() {
        ntrip.stop();
        link.disconnect();
    }
}
