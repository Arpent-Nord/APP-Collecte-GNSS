package com.arpentnord.collecte;

/**
 * Lecture passive du flux de corrections RTCM 3 : repère les messages 1005 / 1006
 * (position ECEF de la station de référence, réelle ou virtuelle) pour calculer la ligne de base.
 * Les octets sont transmis tels quels au récepteur ; ce lecteur ne fait qu'observer.
 */
public class RtcmScanner {

    public interface Listener {
        void onStation(int id, double x, double y, double z);
    }

    private final Listener listener;
    private final byte[] buf = new byte[1100];
    private int len = 0;

    public RtcmScanner(Listener listener) {
        this.listener = listener;
    }

    public void push(byte[] data, int off, int n) {
        for (int i = 0; i < n; i++) pushByte(data[off + i]);
    }

    private void pushByte(byte b) {
        if (len == 0 && (b & 0xFF) != 0xD3) return; // attente d'un début de trame
        if (len >= buf.length) { len = 0; return; }
        buf[len++] = b;
        if (len < 3) return;
        int payload = ((buf[1] & 0x03) << 8) | (buf[2] & 0xFF);
        if ((buf[1] & 0xFC) != 0 || payload > 1023) { resync(); return; }
        int total = 3 + payload + 3;
        if (len < total) return;
        int crc = ((buf[total - 3] & 0xFF) << 16) | ((buf[total - 2] & 0xFF) << 8) | (buf[total - 1] & 0xFF);
        if (crc24q(buf, 0, 3 + payload) == crc) {
            decode(3, payload);
            len = 0;
        } else {
            resync();
        }
    }

    /** Après une trame invalide : on cherche le prochain 0xD3 dans ce qui a déjà été reçu. */
    private void resync() {
        int start = -1;
        for (int i = 1; i < len; i++) if ((buf[i] & 0xFF) == 0xD3) { start = i; break; }
        if (start < 0) { len = 0; return; }
        byte[] rest = new byte[len - start];
        System.arraycopy(buf, start, rest, 0, rest.length);
        len = 0;
        for (byte r : rest) pushByte(r);
    }

    private void decode(int p, int n) {
        int type = (int) bits(p, 0, 12);
        if (type != 1005 && type != 1006) return;
        if (n < 19) return;
        int id = (int) bits(p, 12, 12);
        // 12 type + 12 station + 6 année ITRF + 4 indicateurs = 34
        double x = sbits(p, 34, 38) * 0.0001;
        double y = sbits(p, 34 + 38 + 2, 38) * 0.0001;
        double z = sbits(p, 34 + 38 + 2 + 38 + 2, 38) * 0.0001;
        listener.onStation(id, x, y, z);
    }

    private long bits(int p, int pos, int n) {
        long v = 0;
        for (int i = pos; i < pos + n; i++) {
            v = (v << 1) | ((buf[p + i / 8] >> (7 - i % 8)) & 1);
        }
        return v;
    }

    private long sbits(int p, int pos, int n) {
        long v = bits(p, pos, n);
        if ((v & (1L << (n - 1))) != 0) v -= (1L << n);
        return v;
    }

    static int crc24q(byte[] d, int off, int n) {
        int crc = 0;
        for (int i = off; i < off + n; i++) {
            crc ^= (d[i] & 0xFF) << 16;
            for (int j = 0; j < 8; j++) {
                crc <<= 1;
                if ((crc & 0x1000000) != 0) crc ^= 0x1864CFB;
            }
        }
        return crc & 0xFFFFFF;
    }
}
