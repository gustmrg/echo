#!/usr/bin/env python3
"""Generate placeholder brand art for the Parler fork.

Handy's icons, logo, and tray images are NOT open source, so this fork ships
its own placeholders: a dark rounded-square app icon with a microphone glyph
and a signal-red lock badge (speech + privacy theme), plus simple 64px
tray/status glyphs.

Uses only the Python standard library (zlib) to write PNGs.
Re-run after changing BRAND colors; regenerate the Tauri icon set with:

    npx --yes @tauri-apps/cli icon scripts/parler-icon-source.png

Replace all of these files with real brand art before a public release.
"""

import math
import os
import struct
import zlib

INK = (27, 28, 33)        # #1b1c21
SIGNAL = (229, 72, 77)    # #e5484d
AMBER = (240, 178, 60)
GRAY = (154, 157, 167)
LIGHT = (230, 231, 235)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.buf = bytearray(w * h * 4)  # transparent

    def blend(self, x, y, color, alpha=255):
        if not (0 <= x < self.w and 0 <= y < self.h) or alpha == 0:
            return
        i = (y * self.w + x) * 4
        a = alpha / 255.0
        for k, c in enumerate(color):
            self.buf[i + k] = round(c * a + self.buf[i + k] * (1 - a))
        self.buf[i + 3] = min(255, self.buf[i + 3] + alpha)

    def rounded_rect(self, x0, y0, x1, y1, r, color):
        for y in range(int(y0), int(y1)):
            for x in range(int(x0), int(x1)):
                # signed distance to rounded-rect border
                cx = min(max(x, x0 + r), x1 - r)
                cy = min(max(y, y0 + r), y1 - r)
                d = math.hypot(x - cx, y - cy)
                if d <= r - 1:
                    self.blend(x, y, color)
                elif d <= r:  # 1px AA edge
                    self.blend(x, y, color, round(255 * (r - d)))

    def disc(self, cx, cy, r, color):
        for y in range(int(cy - r - 1), int(cy + r + 1)):
            for x in range(int(cx - r - 1), int(cx + r + 1)):
                d = math.hypot(x - cx, y - cy)
                if d <= r - 1:
                    self.blend(x, y, color)
                elif d <= r:
                    self.blend(x, y, color, round(255 * (r - d)))

    def ring(self, cx, cy, r, thickness, color):
        for y in range(int(cy - r - 1), int(cy + r + 1)):
            for x in range(int(cx - r - 1), int(cx + r + 1)):
                d = math.hypot(x - cx, y - cy)
                if abs(d - r) <= thickness / 2:
                    self.blend(x, y, color)

    def arc(self, cx, cy, r, thickness, a0, a1, color):
        """Ring segment; angles in degrees, 0 = +x axis, clockwise (y down)."""
        ext = r + thickness / 2 + 1
        for y in range(int(cy - ext), int(cy + ext)):
            for x in range(int(cx - ext), int(cx + ext)):
                d = math.hypot(x - cx, y - cy)
                if abs(d - r) > thickness / 2:
                    continue
                ang = math.degrees(math.atan2(y - cy, x - cx)) % 360
                if a0 <= ang <= a1:
                    self.blend(x, y, color)

    def bars(self, cx, cy, heights, width, gap, color):
        n = len(heights)
        total = n * width + (n - 1) * gap
        x = cx - total / 2
        for hgt in heights:
            self.rounded_rect(x, cy - hgt / 2, x + width, cy + hgt / 2,
                              width / 2, color)
            x += width + gap

    def mic(self, cx, cy, s, color):
        """Microphone glyph centered on (cx, cy); s = scale (1.0 at 64px)."""
        # capsule
        self.rounded_rect(cx - 7 * s, cy - 24 * s, cx + 7 * s, cy + 4 * s,
                          7 * s, color)
        # cradle arc (lower half)
        self.arc(cx, cy + 2 * s, 13 * s, 4 * s, 20, 160, color)
        # stem + base
        self.rounded_rect(cx - 2 * s, cy + 13 * s, cx + 2 * s, cy + 19 * s,
                          2 * s, color)
        self.rounded_rect(cx - 9 * s, cy + 19 * s, cx + 9 * s, cy + 23 * s,
                          2 * s, color)

    def lock_badge(self, cx, cy, r, disc_color, lock_color):
        """Padlock badge: disc with shackle arc + body."""
        self.disc(cx, cy, r, disc_color)
        s = r / 180.0  # authored at r=180
        self.arc(cx, cy - 10 * s, 58 * s, 38 * s, 180, 360, lock_color)
        self.rounded_rect(cx - 60 * s, cy - 15 * s, cx + 60 * s, cy + 80 * s,
                          26 * s, lock_color)

    def save(self, path):
        rows = bytearray()
        stride = self.w * 4
        for y in range(self.h):
            rows.append(0)  # filter: none
            rows += self.buf[y * stride:(y + 1) * stride]

        def chunk(tag, data):
            c = struct.pack(">I", len(data)) + tag + data
            return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

        png = (b"\x89PNG\r\n\x1a\n"
               + chunk(b"IHDR", struct.pack(">IIBBBBB", self.w, self.h, 8, 6, 0, 0, 0))
               + chunk(b"IDAT", zlib.compress(bytes(rows), 9))
               + chunk(b"IEND", b""))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(png)
        print(f"wrote {os.path.relpath(path, ROOT)} ({self.w}x{self.h})")


def app_icon(size, path):
    c = Canvas(size, size)
    c.rounded_rect(0, 0, size, size, size * 0.225, INK)
    s = (size / 64.0) * 0.82  # mic authored at 64px, leave breathing room
    c.mic(size / 2, size / 2 - 20 * (size / 1240.0), s, LIGHT)
    c.lock_badge(size * 0.76, size * 0.74, size * 0.145, SIGNAL, LIGHT)
    c.save(path)


def glyph(path, draw):
    c = Canvas(64, 64)
    draw(c)
    c.save(path)


def main():
    # source for `tauri icon` (regenerates src-tauri/icons/*)
    app_icon(1240, os.path.join(ROOT, "scripts", "parler-icon-source.png"))

    res = os.path.join(ROOT, "src-tauri", "resources")

    def mic(color):
        return lambda c: c.mic(32, 32, 1.0, color)

    glyphs = {
        "tray_idle.png": mic(GRAY),
        "tray_idle_dark.png": mic(LIGHT),
        "tray_recording.png": mic(SIGNAL),
        "tray_recording_dark.png": mic(SIGNAL),
        "tray_transcribing.png": lambda c: c.ring(32, 32, 18, 7, GRAY),
        "tray_transcribing_dark.png": lambda c: c.ring(32, 32, 18, 7, LIGHT),
        "tray_idle_warning.png": lambda c: (mic(GRAY)(c), c.disc(50, 14, 8, AMBER)),
        "tray_idle_warning_dark.png": lambda c: (mic(LIGHT)(c), c.disc(50, 14, 8, AMBER)),
        "recording.png": lambda c: c.disc(32, 32, 20, SIGNAL),
        "transcribing.png": lambda c: c.ring(32, 32, 18, 7, GRAY),
        "handy.png": lambda c: (c.rounded_rect(4, 4, 60, 60, 14, INK),
                                c.mic(32, 31, 0.8, SIGNAL)),
        "handy_warning.png": lambda c: (c.rounded_rect(4, 4, 60, 60, 14, INK),
                                        c.mic(32, 31, 0.8, AMBER)),
    }
    for name, draw in glyphs.items():
        glyph(os.path.join(res, name), draw)


if __name__ == "__main__":
    main()
