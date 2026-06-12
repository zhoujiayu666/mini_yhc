"""生成照明控制模式线条图标 PNG"""
import math
import os
from PIL import Image, ImageDraw

OUT_DIR = os.path.join(
    os.path.dirname(__file__), '..', 'pages', 'color-control', 'images', 'modes'
)
SIZE = 96
CENTER = SIZE // 2
NORMAL = (74, 74, 74, 255)
ACTIVE = (26, 26, 26, 255)
LINE = 4


def new_canvas():
    return Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))


def save_pair(name, draw_fn):
    os.makedirs(OUT_DIR, exist_ok=True)
    for suffix, color in [('', NORMAL), ('-active', ACTIVE)]:
        img = new_canvas()
        draw = ImageDraw.Draw(img)
        draw_fn(draw, color)
        path = os.path.join(OUT_DIR, f'{name}{suffix}.png')
        img.save(path, 'PNG')
        print('wrote', path)


def draw_sun(draw, color):
    r = 14
    draw.ellipse(
        (CENTER - r, CENTER - r, CENTER + r, CENTER + r),
        outline=color, width=LINE
    )
    rays = [(0, -28), (0, 28), (-28, 0), (28, 0), (-20, -20), (20, 20), (-20, 20), (20, -20)]
    for dx, dy in rays:
        x1, y1 = CENTER + int(dx * 0.55), CENTER + int(dy * 0.55)
        x2, y2 = CENTER + dx, CENTER + dy
        draw.line((x1, y1, x2, y2), fill=color, width=LINE)


def draw_flash(draw, color):
    pts = [
        (52, 14), (34, 50), (50, 50), (28, 82), (66, 46), (50, 46), (62, 14)
    ]
    draw.polygon(pts, outline=color, width=LINE)


def draw_breath(draw, color):
    def wave(y, amp, phase=0):
        pts = []
        for x in range(16, SIZE - 16, 4):
            t = (x - 16) / (SIZE - 32) * math.pi * 2
            py = y + math.sin(t + phase) * amp
            pts.append((x, py))
        if len(pts) > 1:
            draw.line(pts, fill=color, width=LINE)

    wave(40, 8, 0)
    wave(58, 6, math.pi / 2)


def draw_party(draw, color):
    pts = []
    for i in range(10):
        angle = -math.pi / 2 + i * math.pi / 5
        radius = 28 if i % 2 == 0 else 12
        pts.append((
            CENTER + radius * math.cos(angle),
            CENTER + radius * math.sin(angle)
        ))
    draw.polygon(pts, outline=color, width=LINE)


def draw_rainbow(draw, color):
    # 与其他图标对齐：顶部约 y=20（同太阳/星星），底部约 y=54
    base_y = CENTER + 6
    for i, (rw, rh) in enumerate([(44, 34), (32, 24), (20, 14)]):
        box = (
            CENTER - rw // 2,
            base_y - rh,
            CENTER + rw // 2,
            base_y
        )
        opacity = 255 - i * 50
        c = (*color[:3], opacity)
        draw.arc(box, start=180, end=360, fill=c, width=LINE)


if __name__ == '__main__':
    save_pair('white', draw_sun)
    save_pair('flash', draw_flash)
    save_pair('breath', draw_breath)
    save_pair('party', draw_party)
    save_pair('rainbow', draw_rainbow)
