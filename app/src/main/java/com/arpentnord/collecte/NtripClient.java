package com.arpentnord.collecte;

import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Client NTRIP (v1, compatible avec les réponses HTTP/1.1 et l'encodage « chunked »).
 * Reçoit les corrections RTCM et les transmet au récepteur par le lien Bluetooth.
 * Reconnexion automatique tant que l'utilisateur n'a pas arrêté.
 */
public class NtripClient {

    public interface Listener {
        void onState(String state, String msg, long bytes);
        void onCorrections(byte[] data, int off, int len);
    }

    public static class Mount {
        public final String name;
        public final String info;
        Mount(String name, String info) { this.name = name; this.info = info; }
    }

    private static final String AGENT = "NTRIP ArpentNordCollecte/" + BuildConfig.VERSION_NAME;
    private static final int RETRY_MS = 5000;

    private final Listener listener;
    private final ExecutorService sender = Executors.newSingleThreadExecutor();
    private volatile boolean running;
    private volatile Socket socket;
    private volatile long bytes;
    private volatile String lastGga;
    private volatile Thread thread;

    /** Vrai seulement pour le fil de la session active (évite qu'un ancien fil continue après un redémarrage). */
    private boolean alive() {
        return running && Thread.currentThread() == thread;
    }

    public NtripClient(Listener listener) {
        this.listener = listener;
    }

    public synchronized void start(String host, int port, String mount, String user, String pass) {
        stop();
        running = true;
        bytes = 0;
        thread = new Thread(() -> loop(host, port, mount, user, pass), "ntrip");
        thread.start();
    }

    public synchronized void stop() {
        running = false;
        closeSocket();
        thread = null;
    }

    /** Position du récepteur envoyée au serveur (nécessaire pour les réseaux VRS). */
    public void sendGga(String gga) {
        lastGga = gga;
        final Socket s = socket;
        if (s == null) return;
        sender.execute(() -> {
            try {
                OutputStream o = s.getOutputStream();
                o.write((gga + "\r\n").getBytes(StandardCharsets.US_ASCII));
                o.flush();
            } catch (IOException ignored) {
            }
        });
    }

    /** Version du protocole qui a fonctionné (1 ou 2) ; on essaie v1 puis v2 en cas de refus. */
    private int ntripVersion = 1;

    private void loop(String host, int port, String mount, String user, String pass) {
        ntripVersion = 1;
        while (alive()) {
            String fatal = session(host, port, mount, user, pass);
            if (fatal != null && fatal.startsWith("RETRY_V2") && ntripVersion == 1) {
                ntripVersion = 2; // certains points de montage n'acceptent que NTRIP 2.0
                continue;
            }
            if (fatal != null && fatal.startsWith("RETRY_V2")) fatal = fatal.substring(8);
            if (!alive()) return;
            if (fatal != null) {
                synchronized (this) {
                    if (thread == Thread.currentThread()) running = false;
                }
                listener.onState("error", fatal, bytes);
                listener.onState("stopped", fatal, bytes);
                return;
            }
            listener.onState("retry", "Coupure — nouvelle tentative dans 5 s", bytes);
            try {
                Thread.sleep(RETRY_MS);
            } catch (InterruptedException e) {
                return;
            }
        }
    }

    /** Une session. Retourne un message d'erreur définitive, ou null pour réessayer. */
    private String session(String host, int port, String mount, String user, String pass) {
        listener.onState("connecting", "Connexion à " + host + ":" + port + "/" + mount, bytes);
        Socket s = new Socket();
        try {
            s.connect(new InetSocketAddress(host, port), 10000);
            s.setSoTimeout(30000);
            socket = s;
            OutputStream o = s.getOutputStream();
            o.write(request("/" + mount, host, port, user, pass, ntripVersion).getBytes(StandardCharsets.US_ASCII));
            if (lastGga != null) o.write((lastGga + "\r\n").getBytes(StandardCharsets.US_ASCII));
            o.flush();

            InputStream in = s.getInputStream();
            List<String> head = readHeader(in);
            String status = head.isEmpty() ? "" : head.get(0);
            if (status.startsWith("SOURCETABLE")) return "Point de montage « " + mount + " » introuvable";
            if (status.contains("401") || status.contains("403")) {
                return "RETRY_V2" + "Refus du serveur (NTRIP " + ntripVersion + ".0, « " + status.trim() + " ») : vérifier l'utilisateur, le mot de passe, "
                        + "l'abonnement à « " + mount + " », ou une autre connexion déjà ouverte avec ce compte";
            }
            if (!(status.startsWith("ICY 200") || status.matches("HTTP/1\\.[01] 200.*"))) {
                return "Réponse inattendue du serveur : « " + status.trim() + " »";
            }
            boolean chunked = false;
            for (String h : head) {
                if (h.toLowerCase().startsWith("transfer-encoding:") && h.toLowerCase().contains("chunked")) chunked = true;
            }
            listener.onState("connected", "Corrections reçues de " + mount + " (NTRIP " + ntripVersion + ".0)", bytes);
            if (chunked) readChunked(in); else readRaw(in);
            return null;
        } catch (IOException e) {
            return null;
        } finally {
            if (socket == s) socket = null;
            try { s.close(); } catch (IOException ignored) { }
        }
    }

    private long lastReport;

    private void deliver(byte[] buf, int off, int n) {
        bytes += n;
        listener.onCorrections(buf, off, n);
        long now = System.currentTimeMillis();
        if (now - lastReport > 2000) {
            lastReport = now;
            listener.onState("connected", "Corrections reçues", bytes);
        }
    }

    private void readRaw(InputStream in) throws IOException {
        byte[] buf = new byte[4096];
        int n;
        while (alive() && (n = in.read(buf)) >= 0) {
            if (n > 0) deliver(buf, 0, n);
        }
    }

    private void readChunked(InputStream in) throws IOException {
        byte[] buf = new byte[4096];
        while (alive()) {
            String sizeLine = readLine(in);
            if (sizeLine == null) return;
            sizeLine = sizeLine.trim();
            if (sizeLine.isEmpty()) continue;
            int semi = sizeLine.indexOf(';');
            int size = Integer.parseInt(semi >= 0 ? sizeLine.substring(0, semi) : sizeLine, 16);
            if (size == 0) return;
            int left = size;
            while (left > 0 && alive()) {
                int n = in.read(buf, 0, Math.min(buf.length, left));
                if (n < 0) return;
                deliver(buf, 0, n);
                left -= n;
            }
            readLine(in); // CRLF après le bloc
        }
    }

    private static String request(String path, String host, int port, String user, String pass, int version) {
        StringBuilder r = new StringBuilder();
        if (version == 2) {
            r.append("GET ").append(path).append(" HTTP/1.1\r\n");
            r.append("Host: ").append(host).append(":").append(port).append("\r\n");
            r.append("Ntrip-Version: Ntrip/2.0\r\n");
        } else {
            r.append("GET ").append(path).append(" HTTP/1.0\r\n");
            r.append("Host: ").append(host).append("\r\n");
        }
        r.append("User-Agent: ").append(AGENT).append("\r\n");
        r.append("Accept: */*\r\n");
        if (user != null && !user.isEmpty()) {
            String token = Base64.encodeToString((user + ":" + (pass == null ? "" : pass)).getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
            r.append("Authorization: Basic ").append(token).append("\r\n");
        }
        r.append("Connection: close\r\n\r\n");
        return r.toString();
    }

    private static List<String> readHeader(InputStream in) throws IOException {
        List<String> lines = new ArrayList<>();
        String l;
        while ((l = readLine(in)) != null) {
            if (l.isEmpty()) {
                if (lines.isEmpty()) continue;
                break;
            }
            lines.add(l);
            // Certains serveurs NTRIP v1 envoient « ICY 200 OK » sans ligne vide.
            if (lines.size() == 1 && l.startsWith("ICY 200")) {
                break;
            }
            if (lines.size() > 50) break;
        }
        return lines;
    }

    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int c;
        while ((c = in.read()) >= 0) {
            if (c == '\n') break;
            if (c != '\r') b.write(c);
            if (b.size() > 4096) break;
        }
        if (c < 0 && b.size() == 0) return null;
        return b.toString("ISO-8859-1");
    }

    /** Liste des points de montage (table des sources). Appel bloquant : à lancer hors du fil principal. */
    public static List<Mount> sourcetable(String host, int port, String user, String pass) throws IOException {
        List<Mount> mounts = new ArrayList<>();
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(host, port), 10000);
            s.setSoTimeout(15000);
            OutputStream o = s.getOutputStream();
            o.write(request("/", host, port, user, pass, 1).getBytes(StandardCharsets.US_ASCII));
            o.flush();
            InputStream in = s.getInputStream();
            String l;
            int count = 0;
            while ((l = readLine(in)) != null && count++ < 5000) {
                if (l.startsWith("ENDSOURCETABLE")) break;
                if (l.startsWith("STR;")) {
                    String[] f = l.split(";", -1);
                    if (f.length > 1) {
                        mounts.add(new Mount(f[1], l)); // ligne STR complète, décodée côté interface
                    }
                }
            }
        }
        return mounts;
    }

    private void closeSocket() {
        Socket s = socket;
        socket = null;
        if (s != null) {
            try { s.close(); } catch (IOException ignored) { }
        }
    }
}
