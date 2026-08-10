#!/usr/bin/env python3
"""Generate placeholder brand art for the Echo fork.

Handy's icons, logo, and tray images are NOT open source, so this fork ships
its own placeholders: a dark rounded-square app icon with signal-red waveform
bars (matching the Echo UI mock), plus simple 64px tray/status glyphs.

Uses only the Python standard library (zlib) to write PNGs.
Re-run after changing BRAND colors; regenerate the Tauri icon set with:

    npx --yes @tauri-apps/cli icon scripts/echo-icon-source.png

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

    def bars(self, cx, cy, heights, width, gap, color):
        n = len(heights)
        total = n * width + (n - 1) * gap
        x = cx - total / 2
        for hgt in heights:
            self.rounded_rect(x, cy - hgt / 2, x + width, cy + hgt / 2,
                              width / 2, color)
            x += width + gap

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
    s = size / 1240.0  # authored at 1240px
    heights = [h * s for h in (260, 430, 640, 820, 640, 430, 260)]
    c.bars(size / 2, size / 2, heights, 88 * s, 64 * s, SIGNAL)
    c.save(path)


def glyph(path, draw):
    c = Canvas(64, 64)
    draw(c)
    c.save(path)


def main():
    # source for `tauri icon` (regenerates src-tauri/icons/*)
    app_icon(1240, os.path.join(ROOT, "scripts", "echo-icon-source.png"))

    res = os.path.join(ROOT, "src-tauri", "resources")

    def bars(color):
        return lambda c: c.bars(32, 32, [16, 26, 36, 26, 16], 6, 5, color)

    glyphs = {
        "tray_idle.png": bars(GRAY),
        "tray_idle_dark.png": bars(LIGHT),
        "tray_recording.png": bars(SIGNAL),
        "tray_recording_dark.png": bars(SIGNAL),
        "tray_transcribing.png": lambda c: c.ring(32, 32, 18, 7, GRAY),
        "tray_transcribing_dark.png": lambda c: c.ring(32, 32, 18, 7, LIGHT),
        "tray_idle_warning.png": lambda c: (bars(GRAY)(c), c.disc(50, 14, 8, AMBER)),
        "tray_idle_warning_dark.png": lambda c: (bars(LIGHT)(c), c.disc(50, 14, 8, AMBER)),
        "recording.png": lambda c: c.disc(32, 32, 20, SIGNAL),
        "transcribing.png": lambda c: c.ring(32, 32, 18, 7, GRAY),
        "handy.png": lambda c: (c.rounded_rect(4, 4, 60, 60, 14, INK),
                                c.bars(32, 32, [14, 24, 32, 24, 14], 5, 4, SIGNAL)),
        "handy_warning.png": lambda c: (c.rounded_rect(4, 4, 60, 60, 14, INK),
                                        c.bars(32, 32, [14, 24, 32, 24, 14], 5, 4, AMBER)),
    }
    for name, draw in glyphs.items():
        glyph(os.path.join(res, name), draw)


if __name__ == "__main__":
    main()
