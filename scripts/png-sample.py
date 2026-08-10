#!/usr/bin/env python3
"""Sample pixel colors from a PNG (stdlib only). Usage:
   python3 scripts/png-sample.py <file> <x> <y> [x2 y2 ...]
   python3 scripts/png-sample.py <file> --scan   # most common saturated colors
"""
import struct
import sys
import zlib


def read_png(path):
    data = open(path, "rb").read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    pos = 8
    idat = b""
    w = h = bitdepth = colortype = None
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos:pos + 4])
        tag = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        if tag == b"IHDR":
            w, h, bitdepth, colortype = struct.unpack(">IIBB", body[:10])
        elif tag == b"IDAT":
            idat += body
        elif tag == b"IEND":
            break
        pos += 12 + length
    assert bitdepth == 8 and colortype in (2, 6), f"unsupported {bitdepth}/{colortype}"
    ch = 3 if colortype == 2 else 4
    raw = zlib.decompress(idat)
    stride = w * ch
    px = bytearray(w * h * ch)
    prev = bytearray(stride)
    off = 0
    for y in range(h):
        f = raw[off]
        off += 1
        line = bytearray(raw[off:off + stride])
        off += stride
        if f == 1:
            for i in range(ch, stride):
                line[i] = (line[i] + line[i - ch]) & 0xFF
        elif f == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif f == 3:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xFF
        elif f == 4:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                b = prev[i]
                c = prev[i - ch] if i >= ch else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 0xFF
        px[y * stride:(y + 1) * stride] = line
        prev = line
    return w, h, ch, px


def get(px, ch, w, x, y):
    i = (y * w + x) * ch
    return tuple(px[i:i + 3])


if __name__ == "__main__":
    path = sys.argv[1]
    w, h, ch, px = read_png(path)
    if len(sys.argv) > 2 and sys.argv[2] == "--scan":
        from collections import Counter
        cnt = Counter()
        for y in range(0, h, 2):
            for x in range(0, w, 2):
                r, g, b = get(px, ch, w, x, y)
                mx, mn = max(r, g, b), min(r, g, b)
                if mx - mn > 60 and mx > 100:  # saturated, not too dark
                    cnt[(r // 8 * 8, g // 8 * 8, b // 8 * 8)] += 1
        for (r, g, b), n in cnt.most_common(12):
            print(f"#{r:02x}{g:02x}{b:02x}  x{n}")
    else:
        coords = list(map(int, sys.argv[2:]))
        for i in range(0, len(coords), 2):
            x, y = coords[i], coords[i + 1]
            r, g, b = get(px, ch, w, x, y)
            print(f"({x},{y})  #{r:02x}{g:02x}{b:02x}")
