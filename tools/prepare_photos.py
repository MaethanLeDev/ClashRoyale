import sys
from PIL import Image, ImageDraw

SRC = sys.argv[1]
OUT = sys.argv[2]

PHOTOS = {
    "valere": ("375a6fa4-image.png", (20, 150, 400, 530)),
    "goutier": ("1507edb5-image.png", (85, 0, 295, 210)),
    "midas": ("8981e34a-image.png", (0, 50, 522, 572)),
    "samy": ("edf0e58a-image.png", (125, 22, 305, 202)),
    "natis": ("080089e8-image.png", (560, 180, 1640, 1260)),
    "tordeux": ("c381652b-image.png", (600, 260, 1540, 1200)),
    "imad": ("cc3522c5-image.png", (1215, 250, 2185, 1220)),
    "niels": ("59688f97-image.jpg", (611, 785, 1411, 1585)),
    "nazar": ("c39e52cd-image.png", (431, 78, 1496, 1143)),
}

for cid, (fname, box) in PHOTOS.items():
    im = Image.open(f"{SRC}/{fname}").convert("RGBA")
    head = im.crop(box).resize((256, 256), Image.LANCZOS)
    bg = Image.new("RGBA", (256, 256), (235, 225, 210, 255))
    bg.alpha_composite(head)
    mask = Image.new("L", (256, 256), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, 255, 255), fill=255)
    out = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    out.paste(bg, (0, 0), mask)
    out.save(f"{OUT}/heads/{cid}.png")
    w, h = im.size
    scale = 720 / max(w, h)
    if scale < 1:
        im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    im.save(f"{OUT}/cards/{cid}.png", optimize=True)


def head_from(im, box, out_path):
    head = im.crop(box).resize((256, 256), Image.LANCZOS)
    bg = Image.new("RGBA", (256, 256), (235, 225, 210, 255))
    bg.alpha_composite(head)
    mask = Image.new("L", (256, 256), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, 255, 255), fill=255)
    res = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    res.paste(bg, (0, 0), mask)
    res.save(out_path)


def compose_tarit(person_path, car_path, out):
    person = Image.open(person_path).convert("RGBA")
    car = Image.open(car_path).convert("RGBA")
    W, H = 540, 720
    card = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    grad = ImageDraw.Draw(card)
    for y in range(H):
        k = y / H
        grad.line([(0, y), (W, y)], fill=(int(40 + 30 * k), int(44 + 20 * k), int(70 - 20 * k), 255))
    cw = W
    ch = round(car.height * cw / car.width)
    car_r = car.resize((cw, ch), Image.LANCZOS)
    fade = Image.new("L", (cw, ch), 255)
    fd = ImageDraw.Draw(fade)
    for y in range(150):
        fd.line([(0, y), (cw, y)], fill=int(255 * (y / 150) ** 1.6))
    car_r.putalpha(fade)
    top = person.crop((0, 0, person.width, round(person.height * 0.62)))
    ph = 500
    pw = round(top.width * ph / top.height)
    top = top.resize((pw, ph), Image.LANCZOS)
    card.alpha_composite(top, ((W - pw) // 2 - 10, 0))
    card.alpha_composite(car_r, (0, H - ch))
    card.convert("RGB").save(f"{out}/cards/tarit.png", optimize=True)
    head_from(person, (420, 60, 860, 500), f"{out}/heads/tarit.png")
    head_from(person, (420, 60, 860, 500), f"{out}/heads/taritPilot.png")


if len(sys.argv) >= 5:
    compose_tarit(sys.argv[3], sys.argv[4], OUT)


EXTRAS = {
    "savy": ("3.webp", (230, 100, 880, 750)),
}

if len(sys.argv) >= 6:
    extra_dir = sys.argv[5]
    for cid, (fname, box) in EXTRAS.items():
        im = Image.open(f"{extra_dir}/{fname}").convert("RGBA")
        head_from(im, box, f"{OUT}/heads/{cid}.png")
        w, h = im.size
        scale = 720 / max(w, h)
        if scale < 1:
            im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
        im.save(f"{OUT}/cards/{cid}.png", optimize=True)


def cutout_white(im, thr=246, holes_above=None):
    import numpy as np
    from collections import deque
    from PIL import ImageFilter
    a = np.asarray(im.convert("RGB")).astype(int)
    h, w, _ = a.shape
    white = a.min(axis=2) >= thr
    seen = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if white[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if white[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and white[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    if holes_above:
        seen[: int(h * holes_above)] |= white[: int(h * holes_above)]
    alpha = Image.fromarray(np.where(seen, 0, 255).astype("uint8"))
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1))
    out = im.convert("RGBA")
    out.putalpha(alpha)
    return out


def save_card(im, cid, out):
    w, h = im.size
    scale = 720 / max(w, h)
    if scale < 1:
        im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    im.save(f"{out}/cards/{cid}.png", optimize=True)


NEW_CARDS = {
    "matous": ("20.jpg", True, None, [("matous", (175, 95, 335, 255)), ("pompon", (175, 95, 335, 255)), ("pantoufle", (115, 0, 260, 145)), ("tigrou", (25, 85, 175, 235))]),
    "mathisucre": ("21.jpg", True, 0.4, [("mathisucre", (230, 330, 1330, 1430))]),
    "saez": ("22.jpg", True, None, [("saez", (135, 5, 375, 245))]),
    "paco": ("23.webp", False, None, [("paco", (470, 220, 1030, 780))]),
}

if len(sys.argv) >= 7:
    new_dir = sys.argv[6]
    for cid, (fname, cut, holes, heads) in NEW_CARDS.items():
        im = Image.open(f"{new_dir}/{fname}").convert("RGBA")
        if cut:
            im = cutout_white(im, holes_above=holes)
        for hid, box in heads:
            head_from(im, box, f"{OUT}/heads/{hid}.png")
        save_card(im, cid, OUT)
