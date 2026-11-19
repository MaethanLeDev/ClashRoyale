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
