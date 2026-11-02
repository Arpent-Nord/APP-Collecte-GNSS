package com.arpentnord.collecte;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import java.util.Locale;

/**
 * Service au premier plan : garde le lien Bluetooth, le client NTRIP et le relais
 * des corrections actifs quand l'écran est éteint ou que l'application est en arrière-plan.
 *
 * - Notification permanente : état de la solution, satellites, débit des corrections.
 * - Verrous : processeur (WakeLock partiel) et Wi-Fi (haute performance).
 * - Position (GGA) envoyée au serveur NTRIP par le code natif, aux 10 s, même si l'interface dort.
 * - Reconnexion automatique au récepteur après une coupure (pendant 15 minutes au plus),
 *   sans couper la session NTRIP (la VRS est conservée).
 *
 * L'interface (GnssBridge) s'y rattache par setSink() ; les événements sont perdus sans gravité
 * quand aucune interface n'est rattachée, et l'état courant est rejoué au rattachement (syncState()).
 */
@SuppressLint("MissingPermission")
public class GnssService extends Service implements BluetoothLink.Listener, NtripClient.Listener, RtcmScanner.Listener {

    /** Événements vers l'interface. */
    public interface Sink {
        void onBt(String state, String msg);
        void onData(byte[] data, int len);
        void onNtrip(String state, String msg, long bytes);
        void onStation(int id, double x, double y, double z);
    }

    public static final String ACTION_STOP = "com.arpentnord.collecte.STOP";
    public static final String ACTION_CONNECT = "com.arpentnord.collecte.CONNECT";
    public static final String EXTRA_ADDRESS = "address";
    private static final String CHANNEL = "collecte";
    private static final int NOTIF_ID = 1;
    private static final long GGA_PERIOD_MS = 10000;
    private static final long RECONNECT_DELAY_MS = 5000;
    private static final long RECONNECT_GIVE_UP_MS = 15 * 60 * 1000;
    private static final long NOTIF_MIN_MS = 3000;

    private static volatile GnssService instance;

    /** Service en cours, ou null. */
    public static GnssService get() {
        return instance;
    }

    /** Démarre le service au premier plan et connecte le récepteur (depuis l'activité, à la demande de l'utilisateur). */
    public static void startAndConnect(Context ctx, String address) {
        Intent i = new Intent(ctx, GnssService.class).setAction(ACTION_CONNECT).putExtra(EXTRA_ADDRESS, address);
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
        else ctx.startService(i);
    }

    private final Handler main = new Handler(Looper.getMainLooper());
    private BluetoothLink link;
    private NtripClient ntrip;
    private final RtcmScanner rtcm = new RtcmScanner(this);
    private static volatile Sink sink;

    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;

    // État courant (rejoué à l'interface qui se rattache, et affiché dans la notification)
    private volatile String deviceAddress, deviceName;
    private volatile String btState = "disconnected", btMsg = "Non connecté.";
    private volatile String ntripState = "stopped", ntripMsg = "";
    private volatile long ntripBytes;
    private volatile boolean ntripOn;
    private volatile boolean ggaToCaster = true;
    private volatile boolean everConnected;
    private volatile boolean userStop;
    private volatile long lostAt;
    private volatile int attempts;
    private Integer lastStationId;
    private double lastX, lastY, lastZ;
    private long lastStationAt;

    // Lecture GGA native
    private final StringBuilder line = new StringBuilder(128);
    private volatile String lastGga;
    private volatile int fixQuality = -1, sats = -1;
    private volatile long lastGgaAt, lastGgaSentAt;

    // Notification
    private long lastNotifAt, rateBytes, rateAt;
    private volatile long corrBytes;
    private double rateKbs;
    private final Runnable notifTick = new Runnable() {
        @Override public void run() {
            updateNotification(true);
            main.postDelayed(this, 5000);
        }
    };

    // ------------------------------------------------------------------ Cycle de vie

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        link = new BluetoothLink(this);
        ntrip = new NtripClient(this);
        createChannel();
        startInForeground();
        acquireLocks();
        main.postDelayed(notifTick, 5000);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopAll("Arrêté depuis la notification.", true);
            return START_NOT_STICKY;
        }
        instance = this;
        startInForeground();
        if (intent != null && ACTION_CONNECT.equals(intent.getAction())) connect(intent.getStringExtra(EXTRA_ADDRESS));
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /** L'utilisateur a retiré l'application des applications récentes : on libère le récepteur. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopAll("Application fermée.", true);
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        main.removeCallbacksAndMessages(null);
        userStop = true;
        ntrip.stop();
        link.disconnect();
        releaseLocks();
        if (instance == this) instance = null;
        super.onDestroy();
    }

    // ------------------------------------------------------------------ Commandes (depuis GnssBridge)

    /** Rattache (ou détache, avec null) l'interface. Valable même avant la création du service. */
    public static synchronized void setSink(Sink s) {
        sink = s;
    }

    /** Détache seulement si l'interface rattachée est encore celle-là (une nouvelle activité a pu la remplacer). */
    public static synchronized void setSinkIf(Sink expected, Sink s) {
        if (sink == expected) sink = s;
    }

    /** Rejoue l'état courant à l'interface (page rechargée ou activité recréée). */
    public void syncState() {
        Sink s = sink;
        if (s == null) return;
        s.onBt(btState, btMsg);
        if (ntripOn) s.onNtrip(ntripState, ntripMsg, ntripBytes);
        if (lastStationId != null) s.onStation(lastStationId, lastX, lastY, lastZ);
    }

    public String deviceAddress() {
        return deviceAddress;
    }

    public void connect(String address) {
        userStop = false;
        everConnected = false;
        attempts = 0;
        deviceAddress = address;
        deviceName = address;
        main.removeCallbacks(reconnect);
        link.connect(address);
    }

    /** Déconnexion demandée par l'utilisateur : tout s'arrête et le service se termine. */
    public void disconnect() {
        stopAll("Déconnecté.", true);
    }

    public void ntripStart(String host, int port, String mount, String user, String pass) {
        ntripOn = true;
        ntripBytes = 0;
        corrBytes = 0;
        rateBytes = 0;
        rateAt = 0;
        lastGgaSentAt = System.currentTimeMillis(); // la position part avec la demande
        ntrip.start(host, port, mount, user, pass);
    }

    public void ntripStop() {
        ntripOn = false;
        ntrip.stop();
        ntripState = "stopped";
        ntripMsg = "";
        rateKbs = 0;
        updateNotification(true);
    }

    public void ntripGga(String gga) {
        ntrip.sendGga(gga);
        lastGgaSentAt = System.currentTimeMillis();
    }

    public void setGgaToCaster(boolean on) {
        ggaToCaster = on;
    }

    /** Arrête tout et termine le service ; emitBt : annoncer la déconnexion à l'interface. */
    private void stopAll(String msg, boolean emitBt) {
        if (Looper.myLooper() != Looper.getMainLooper()) { main.post(() -> stopAll(msg, emitBt)); return; }
        if (instance != this) return;
        userStop = true;
        main.removeCallbacks(reconnect);
        boolean wasNtrip = ntripOn;
        ntripOn = false;
        ntrip.stop();
        link.disconnect();
        btState = "disconnected";
        btMsg = msg;
        Sink s = sink;
        if (s != null) {
            if (wasNtrip) s.onNtrip("stopped", "Corrections arrêtées.", ntripBytes);
            if (emitBt) s.onBt("disconnected", msg);
        }
        instance = null;
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        stopSelf();
    }

    // ------------------------------------------------------------------ Bluetooth

    private final Runnable reconnect = new Runnable() {
        @Override public void run() {
            if (userStop || deviceAddress == null) return;
            attempts++;
            link.connect(deviceAddress);
        }
    };

    @Override
    public void onState(String state, String msg) {
        if (userStop) return;
        if ("connected".equals(state)) {
            everConnected = true;
            attempts = 0;
            lostAt = 0;
            deviceName = msg;
            synchronized (line) { line.setLength(0); }
            setBt("connected", msg);
            return;
        }
        boolean failure = "disconnected".equals(state) || "error".equals(state);
        if (!everConnected) {
            // Première connexion : on rapporte tel quel (aucune reconnexion automatique).
            setBt(state, msg);
            if (failure) stopAll(msg, false);
            return;
        }
        if ("connecting".equals(state)) {
            setBt("reconnecting", "Lien perdu avec " + deviceName + " — reconnexion (essai " + Math.max(1, attempts) + ")…");
            return;
        }
        if (failure) {
            long now = System.currentTimeMillis();
            if (lostAt == 0) lostAt = now;
            fixQuality = -1;
            if (now - lostAt > RECONNECT_GIVE_UP_MS) {
                stopAll("Lien perdu avec " + deviceName + " : reconnexion abandonnée après 15 minutes.", true);
                return;
            }
            setBt("reconnecting", "Lien perdu avec " + deviceName + " — nouvelle tentative dans 5 s…");
            main.removeCallbacks(reconnect);
            main.postDelayed(reconnect, RECONNECT_DELAY_MS);
        }
    }

    private void setBt(String state, String msg) {
        btState = state;
        btMsg = msg;
        Sink s = sink;
        if (s != null) s.onBt(state, msg);
        updateNotification(true);
    }

    @Override
    public void onData(byte[] data, int len) {
        scanGga(data, len);
        Sink s = sink;
        if (s != null) s.onData(data, len);
    }

    /** Repère les phrases GGA (avec somme de contrôle valide) dans le flux du récepteur. */
    private void scanGga(byte[] data, int len) {
        synchronized (line) {
            for (int i = 0; i < len; i++) {
                int b = data[i] & 0xFF;
                if (b == '$') { line.setLength(0); line.append('$'); continue; }
                if (line.length() == 0) continue;
                if (b == '\r' || b == '\n') {
                    if (line.length() > 10) onSentence(line.toString());
                    line.setLength(0);
                    continue;
                }
                if (b < 0x20 || b > 0x7E || line.length() > 120) { line.setLength(0); continue; }
                line.append((char) b);
            }
        }
    }

    private void onSentence(String s) {
        if (s.length() < 7 || !s.startsWith("GGA", 3)) return;
        int star = s.lastIndexOf('*');
        if (star < 0 || star + 3 > s.length()) return;
        int sum = 0;
        for (int i = 1; i < star; i++) sum ^= s.charAt(i);
        try {
            if (Integer.parseInt(s.substring(star + 1, star + 3), 16) != sum) return;
        } catch (NumberFormatException e) {
            return;
        }
        String[] f = s.substring(0, star).split(",", -1);
        if (f.length < 8) return;
        int q;
        try { q = f[6].isEmpty() ? 0 : Integer.parseInt(f[6]); } catch (NumberFormatException e) { q = 0; }
        int n;
        try { n = f[7].isEmpty() ? -1 : Integer.parseInt(f[7]); } catch (NumberFormatException e) { n = -1; }
        long now = System.currentTimeMillis();
        boolean changed = q != fixQuality;
        fixQuality = q;
        sats = n;
        lastGgaAt = now;
        if (q > 0) {
            lastGga = s;
            if (ntripOn && ggaToCaster && now - lastGgaSentAt >= GGA_PERIOD_MS) {
                lastGgaSentAt = now;
                ntrip.sendGga(s);
            }
        }
        if (changed) main.post(() -> updateNotification(false));
    }

    // ------------------------------------------------------------------ NTRIP

    @Override
    public void onState(String state, String msg, long bytes) {
        ntripState = state;
        ntripMsg = msg;
        ntripBytes = bytes;
        if ("stopped".equals(state)) ntripOn = false;
        Sink s = sink;
        if (s != null) s.onNtrip(state, msg, bytes);
        main.post(() -> updateNotification(false));
    }

    @Override
    public void onCorrections(byte[] data, int off, int len) {
        corrBytes += len;
        link.write(data, off, len);
        rtcm.push(data, off, len); // position de la base (messages 1005/1006)
    }

    @Override
    public void onStation(int id, double x, double y, double z) {
        long now = System.currentTimeMillis();
        boolean moved = lastStationId == null || Math.abs(x - lastX) + Math.abs(y - lastY) + Math.abs(z - lastZ) > 1.0;
        if (!moved && now - lastStationAt < 30000) return;
        lastStationAt = now;
        lastStationId = id;
        lastX = x; lastY = y; lastZ = z;
        Sink s = sink;
        if (s != null) s.onStation(id, x, y, z);
    }

    // ------------------------------------------------------------------ Notification

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Collecte en cours", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Lien avec le récepteur et corrections RTK actifs en arrière-plan");
        ch.setShowBadge(false);
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(ch);
    }

    private void startInForeground() {
        Notification n = buildNotification();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
        } else {
            startForeground(NOTIF_ID, n);
        }
    }

    private static final String[] FIX = {"Aucune solution", "Autonome", "DGNSS", "PPS", "RTK fixe", "RTK flottant", "Estimée", "Manuelle", "Simulation"};

    private Notification buildNotification() {
        String title, text;
        if ("reconnecting".equals(btState)) {
            title = "Reconnexion au récepteur…";
            text = btMsg;
        } else if ("connected".equals(btState)) {
            title = "Collecte GNSS — " + (deviceName != null ? deviceName : "récepteur");
            boolean fresh = System.currentTimeMillis() - lastGgaAt < 5000;
            StringBuilder t = new StringBuilder();
            if (!fresh) t.append("Aucune donnée du récepteur");
            else {
                t.append(fixQuality >= 0 && fixQuality < FIX.length ? FIX[fixQuality] : "Solution " + fixQuality);
                if (sats >= 0) t.append(" · ").append(sats).append(" sat.");
            }
            if (ntripOn) {
                if ("connected".equals(ntripState)) {
                    t.append(" · Corrections ").append(String.format(Locale.CANADA_FRENCH, "%.1f", rateKbs)).append(" ko/s");
                } else if ("retry".equals(ntripState) || "error".equals(ntripState)) {
                    t.append(" · Corrections coupées");
                } else {
                    t.append(" · Corrections : connexion…");
                }
            }
            text = t.toString();
        } else {
            title = "Collecte GNSS";
            text = "Connexion au récepteur…";
        }

        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent piOpen = PendingIntent.getActivity(this, 0, open, piFlags);
        PendingIntent piStop = PendingIntent.getService(this, 1, new Intent(this, GnssService.class).setAction(ACTION_STOP), piFlags);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_stat_gnss)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setColor(0xFF0B6E69)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setCategory(Notification.CATEGORY_SERVICE)
                .setContentIntent(piOpen)
                .addAction(new Notification.Action.Builder(null, "Arrêter", piStop).build());
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        return b.build();
    }

    /** Met la notification à jour (limité à une fois aux 3 s, sauf si force). Fil principal seulement. */
    private void updateNotification(boolean force) {
        if (Looper.myLooper() != Looper.getMainLooper()) { main.post(() -> updateNotification(force)); return; }
        if (instance != this) return;
        long now = System.currentTimeMillis();
        if (rateAt > 0 && now > rateAt) rateKbs = (corrBytes - rateBytes) / 1024.0 / ((now - rateAt) / 1000.0);
        if (rateAt == 0 || now - rateAt >= 4000) { rateAt = now; rateBytes = corrBytes; }
        if (!force && now - lastNotifAt < NOTIF_MIN_MS) return;
        lastNotifAt = now;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIF_ID, buildNotification());
    }

    // ------------------------------------------------------------------ Verrous

    @SuppressWarnings("deprecation")
    private void acquireLocks() {
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "collecte:gnss");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire();
            }
        } catch (Exception ignored) {
        }
        try {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
            if (wm != null) {
                wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "collecte:ntrip");
                wifiLock.setReferenceCounted(false);
                wifiLock.acquire();
            }
        } catch (Exception ignored) {
        }
    }

    private void releaseLocks() {
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception ignored) { }
        try { if (wifiLock != null && wifiLock.isHeld()) wifiLock.release(); } catch (Exception ignored) { }
        wakeLock = null;
        wifiLock = null;
    }
}
