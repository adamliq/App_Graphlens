#!/usr/bin/env python3
"""Generate placeholder GraphLens icon/logo PNGs with no third-party
dependencies (no Pillow available in this environment).

These are deliberately simple: a dark rounded square with three small
circles ("nodes") joined by lines, in the app's brand colour. They satisfy
Splunkbase's required icon files so the package is installable and
inspectable, but they are placeholders - replace them with real designed
artwork before a public Splunkbase submission (see DEVELOPMENT.md).

Usage: python3 scripts/generate_icons.py
"""
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(os.path.dirname(HERE), "static")

BRAND = (90, 43, 226)       # #5A2BE2
BRAND_LIGHT = (154, 118, 240)
BG = (255, 255, 255)


def make_canvas(width, height, color):
    return [[color for _ in range(width)] for _ in range(height)]


def set_px(canvas, x, y, color, width, height):
    if 0 <= x < width and 0 <= y < height:
        canvas[y][x] = color


def draw_filled_circle(canvas, cx, cy, r, color, width, height):
    for y in range(max(0, cy - r), min(height, cy + r + 1)):
        for x in range(max(0, cx - r), min(width, cx + r + 1)):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                canvas[y][x] = color


def draw_line(canvas, x0, y0, x1, y1, color, width, height, thickness=1):
    steps = max(abs(x1 - x0), abs(y1 - y0), 1)
    for i in range(steps + 1):
        t = i / steps
        x = round(x0 + (x1 - x0) * t)
        y = round(y0 + (y1 - y0) * t)
        for dx in range(-thickness, thickness + 1):
            for dy in range(-thickness, thickness + 1):
                set_px(canvas, x + dx, y + dy, color, width, height)


def draw_rounded_square(canvas, width, height, color, radius):
    for y in range(height):
        for x in range(width):
            corner_x = 0 if x < radius else (width - 1 if x >= width - radius else None)
            corner_y = 0 if y < radius else (height - 1 if y >= height - radius else None)
            if corner_x is not None and corner_y is not None:
                cx = radius if x < radius else width - 1 - radius
                cy = radius if y < radius else height - 1 - radius
                if (x - cx) ** 2 + (y - cy) ** 2 > radius * radius:
                    continue
            canvas[y][x] = color


def build_icon(size):
    canvas = make_canvas(size, size, BRAND)
    draw_rounded_square(canvas, size, size, BRAND, max(2, size // 6))
    r = max(2, size // 10)
    cx1, cy1 = int(size * 0.28), int(size * 0.68)
    cx2, cy2 = int(size * 0.72), int(size * 0.68)
    cx3, cy3 = int(size * 0.5), int(size * 0.28)
    draw_line(canvas, cx1, cy1, cx3, cy3, BG, size, size, thickness=max(1, size // 40))
    draw_line(canvas, cx2, cy2, cx3, cy3, BG, size, size, thickness=max(1, size // 40))
    draw_line(canvas, cx1, cy1, cx2, cy2, BG, size, size, thickness=max(1, size // 40))
    draw_filled_circle(canvas, cx1, cy1, r, BG, size, size)
    draw_filled_circle(canvas, cx2, cy2, r, BG, size, size)
    draw_filled_circle(canvas, cx3, cy3, r, BG, size, size)
    return canvas


def build_logo(width, height):
    canvas = make_canvas(width, height, BG)
    icon_size = height
    icon = build_icon(icon_size)
    for y in range(icon_size):
        for x in range(icon_size):
            canvas[y][x] = icon[y][x]
    # A simple wordmark placeholder: a brand-coloured bar sized
    # proportionally to "graphlens" text, since no font rasteriser is
    # available in this environment. Replace with real logo artwork.
    bar_x0 = icon_size + max(4, width // 40)
    bar_x1 = width - max(4, width // 40)
    bar_y0 = int(height * 0.42)
    bar_y1 = int(height * 0.58)
    for y in range(bar_y0, bar_y1):
        for x in range(bar_x0, bar_x1):
            canvas[y][x] = BRAND_LIGHT if (x // max(1, width // 40)) % 2 == 0 else BRAND
    return canvas


def write_png(path, canvas):
    height = len(canvas)
    width = len(canvas[0])
    raw = bytearray()
    for row in canvas:
        raw.append(0)  # no filter
        for (r, g, b) in row:
            raw.extend((r, g, b))

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(png)


if __name__ == "__main__":
    os.makedirs(STATIC_DIR, exist_ok=True)
    write_png(os.path.join(STATIC_DIR, "appIcon.png"), build_icon(36))
    write_png(os.path.join(STATIC_DIR, "appIcon_2x.png"), build_icon(72))
    write_png(os.path.join(STATIC_DIR, "appLogo.png"), build_logo(160, 40))
    write_png(os.path.join(STATIC_DIR, "appLogo_2x.png"), build_logo(320, 80))
    print("Wrote placeholder icons to", STATIC_DIR)
