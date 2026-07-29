# Генератор иконок Job Fit Copilot (чистый stdlib, без PIL).
# Тёмный квадрат #0d1420 + янтарная галочка #f2a93b — в цветах темы панели.
import struct
import zlib

INK = (26, 23, 19)     # #1A1713 — тёмный chrome бренда
AMBER = (242, 163, 60)  # #F2A33C — фирменный янтарь


def dist_to_segment(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    length_sq = dx * dx + dy * dy
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq))
    cx, cy = ax + t * dx, ay + t * dy
    return ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5


def make_icon(size):
    s = float(size)
    # Галочка: три опорные точки (левая нижняя -> низ -> правая верхняя).
    p1 = (0.26 * s, 0.55 * s)
    p2 = (0.44 * s, 0.71 * s)
    p3 = (0.76 * s, 0.30 * s)
    thickness = 0.085 * s

    raw = bytearray()
    for y in range(size):
        raw.append(0)  # фильтр строки: None
        for x in range(size):
            d = min(
                dist_to_segment(x + 0.5, y + 0.5, *p1, *p2),
                dist_to_segment(x + 0.5, y + 0.5, *p2, *p3),
            )
            raw += bytes(AMBER if d <= thickness else INK)
    return bytes(raw)


def chunk(tag, data):
    body = tag + data
    return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body))


def write_png(path, size):
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)  # 8-бит RGB
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', ihdr)
           + chunk(b'IDAT', zlib.compress(make_icon(size), 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)
    print(f'{path}: {size}x{size}, {len(png)} bytes')


if __name__ == '__main__':
    import os
    os.makedirs('icons', exist_ok=True)
    for s in (16, 32, 48, 128):
        write_png(f'icons/icon{s}.png', s)
