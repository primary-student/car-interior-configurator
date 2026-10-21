"""重制 PPT 用图：外侧留白收紧、封面左侧压暗（保证文字对比）、落地页提亮。"""
import os
from PIL import Image, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "video", "shots")
PV = os.path.join(ROOT, "pv")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
os.makedirs(OUT, exist_ok=True)

CANVAS_W, CANVAS_H = 1620, 1080      # 3D 画布（右侧 300px 是配置面板，已裁掉）


def canvas(name):
    im = Image.open(os.path.join(SHOTS, name)).convert("RGB")
    return im.crop((0, 0, CANVAS_W, CANVAS_H))


def tight(im, zoom, cy=0.55, out_w=1080):
    """居中偏下裁切，收紧主体外的空白。"""
    w = int(CANVAS_W / zoom)
    h = int(CANVAS_H / zoom)
    x = (CANVAS_W - w) // 2
    y = int((CANVAS_H - h) * cy)
    im = im.crop((x, y, x + w, y + h))
    return im.resize((out_w, int(out_w * h / w)), Image.LANCZOS)


# ---- 封面：左侧渐变压暗 ----
hero = canvas("v1-ext_default.png").crop((0, 84, CANVAS_W, 84 + 911)).resize((1920, 1080), Image.LANCZOS)
px = hero.load()
W, H = hero.size
for x in range(W):
    t = x / (W - 1)
    # 左侧压到近黑保证文字可读，右侧保留车身质感
    k = 0.11 + (0.97 - 0.11) * (t ** 2.35)
    for y in range(0, H, 1):
        r, g, b = px[x, y]
        px[x, y] = (int(r * k), int(g * k), int(b * k))
hero.save(os.path.join(OUT, "hero.jpg"), quality=92)
print("hero ok")

# ---- 核心体验三图：外侧收紧 ----
for src, dst, zoom in [
    ("v1-ext_sport.png", "sport.jpg", 1.28),
    ("v1-int_fwd.png", "int_fwd.jpg", 1.10),
    ("v1-ext_fresh.png", "fresh.jpg", 1.28),
]:
    tight(canvas(src), zoom).save(os.path.join(OUT, dst), quality=92)
    print(dst, "ok")

# ---- 对比两图：同机位同裁切，只差一个部件 ----
for src, dst in [("v1-int_dash.png", "int_dash.jpg"), ("v1-int_dash_wood.png", "int_dash_wood.jpg")]:
    tight(canvas(src), 1.06, cy=0.58).save(os.path.join(OUT, dst), quality=92)
    print(dst, "ok")

# ---- 落地页双端：提亮一档，深色底上更可读 ----
landing = Image.open(os.path.join(PV, "landing-fit-fhd.png")).convert("RGB").resize((1440, 810), Image.LANCZOS)
landing = ImageEnhance.Brightness(landing).enhance(1.28)
landing.save(os.path.join(OUT, "landing.jpg"), quality=92)

mob = Image.open(os.path.join(PV, "landing-fit-mobile.png")).convert("RGB").resize((430, 930), Image.LANCZOS)
mob = ImageEnhance.Brightness(mob).enhance(1.28)
mob.save(os.path.join(OUT, "mobile.jpg"), quality=92)
print("landing ok")
