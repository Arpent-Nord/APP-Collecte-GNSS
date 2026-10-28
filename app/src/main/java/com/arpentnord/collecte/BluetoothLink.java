package com.arpentnord.collecte;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.UUID;

/**
 * Lien Bluetooth classique (profil port série, SPP) avec un récepteur GNSS.
 * Lit les octets reçus et permet d'écrire (corrections RTCM, commandes).
 * Indépendant de la marque : le décodage se fait dans les pilotes JavaScript.
 */
@SuppressLint("MissingPermission")
public class BluetoothLink {

    public interface Listener {
        void onState(String state, String msg);
        void onData(byte[] data, int len);
    }

    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private final Listener listener;
    private volatile BluetoothSocket socket;
    private volatile OutputStream out;
    private volatile boolean running;
    private volatile int generation;
    private Thread thread;

    public BluetoothLink(Listener listener) {
        this.listener = listener;
    }

    public boolean isConnected() {
        return running && out != null;
    }

    public synchronized void connect(final String address) {
        disconnect();
        running = true;
        final int gen = ++generation;
        thread = new Thread(() -> run(address, gen), "bt-link");
        thread.start();
    }

    private boolean current(int gen) {
        return running && gen == generation;
    }

    private void run(String address, int gen) {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            running = false;
            listener.onState("error", "Bluetooth désactivé");
            return;
        }
        BluetoothDevice dev;
        try {
            dev = adapter.getRemoteDevice(address);
        } catch (IllegalArgumentException e) {
            running = false;
            listener.onState("error", "Adresse invalide");
            return;
        }
        String name = dev.getName() != null ? dev.getName() : address;
        listener.onState("connecting", name);

        BluetoothSocket s = openSocket(dev);
        if (!current(gen)) {
            close(s);
            return;
        }
        if (s == null) {
            running = false;
            listener.onState("error", "Connexion impossible à " + name + " (récepteur allumé? déjà relié à un autre appareil?)");
            return;
        }
        try {
            socket = s;
            out = s.getOutputStream();
            InputStream in = s.getInputStream();
            listener.onState("connected", name);
            byte[] buf = new byte[2048];
            while (current(gen)) {
                int n = in.read(buf);
                if (n < 0) break;
                if (n > 0) listener.onData(buf, n);
            }
            if (current(gen)) listener.onState("disconnected", "Lien perdu avec " + name);
        } catch (IOException e) {
            if (current(gen)) listener.onState("disconnected", "Lien perdu avec " + name);
        } finally {
            synchronized (this) {
                if (gen == generation) {
                    closeQuietly();
                    running = false;
                } else {
                    close(s);
                }
            }
        }
    }

    /** Essaie le canal SPP standard, puis la variante non sécurisée, puis le canal 1 (vieux récepteurs). */
    private BluetoothSocket openSocket(BluetoothDevice dev) {
        BluetoothSocket s = null;
        try {
            s = dev.createRfcommSocketToServiceRecord(SPP);
            s.connect();
            return s;
        } catch (IOException e) {
            close(s);
        }
        try {
            s = dev.createInsecureRfcommSocketToServiceRecord(SPP);
            s.connect();
            return s;
        } catch (IOException e) {
            close(s);
        }
        try {
            Method m = dev.getClass().getMethod("createRfcommSocket", int.class);
            s = (BluetoothSocket) m.invoke(dev, 1);
            if (s != null) {
                s.connect();
                return s;
            }
        } catch (Exception e) {
            close(s);
        }
        return null;
    }

    /** Écrit vers le récepteur (ex. corrections RTCM). Sûr depuis n'importe quel fil. */
    public void write(byte[] data, int off, int len) {
        OutputStream o = out;
        if (o == null) return;
        synchronized (this) {
            try {
                o.write(data, off, len);
                o.flush();
            } catch (IOException e) {
                // la boucle de lecture détectera la coupure
            }
        }
    }

    public synchronized void disconnect() {
        running = false;
        closeQuietly();
        thread = null;
    }

    private void closeQuietly() {
        out = null;
        close(socket);
        socket = null;
    }

    private static void close(BluetoothSocket s) {
        if (s == null) return;
        try {
            s.close();
        } catch (IOException ignored) {
        }
    }
}
