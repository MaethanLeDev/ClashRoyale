"""
Génère un personnage low-poly pour USMB Arena et l'exporte en .glb.

Dans Blender : onglet Scripting > Open > ce fichier > Run Script (Alt+P).
En ligne de commande : blender -b -P tools/blender/build_unit.py -- all   (ou -- valere)

Conventions lues par le jeu (client/src/game/glb.ts) :
  - personnage face à -Y (devient +Z dans Three.js), pieds à z = 0, ~1,9 de haut
  - Empties leg_L, leg_R, arm_L, arm_R placés à la hanche / à l'épaule (pivots)
  - Empty head_anchor : centre de la tête (le jeu y met la photo ronde)
  - matériau nommé "team" : recoloré en bleu / rouge selon l'équipe
"""
import math
import os
import sys

import bpy

CARD = "all"  # ou un id de carte : "valere", "goutier", ...
# EXPORT_ONLY = True : ne reconstruit pas, ré-exporte la collection retouchée
# à la main dans Blender (ex. blender -b fichier.blend -P ... -- valere export).
EXPORT_ONLY = False
if "--" in sys.argv:
    args = sys.argv[sys.argv.index("--") + 1:]
    if args:
        CARD = args[0]
    EXPORT_ONLY = "export" in args[1:]

# Dossier du projet : déduit de l'emplacement du script (tools/blender/),
# sinon chemin par défaut.
DEFAULT_PROJECT = r"D:\Utilisateurs\stiefvan\Documents\ClashRoyale"


def project_dir():
    candidates = []
    try:
        candidates.append(os.path.abspath(__file__))
    except NameError:
        pass
    for t in bpy.data.texts:
        if t.filepath:
            candidates.append(bpy.path.abspath(t.filepath))
    for c in candidates:
        d = os.path.dirname(os.path.dirname(os.path.dirname(c)))
        if os.path.isdir(os.path.join(d, "client", "public")):
            return d
    return DEFAULT_PROJECT


# ---------------------------------------------------------------- utilitaires

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def material(name, hex_color, metallic=0.0, roughness=0.8, emissive=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if not getattr(m, "use_nodes", True):
        m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    r, g, b = [srgb_to_linear(((hex_color >> s) & 255) / 255) for s in (16, 8, 0)]
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emissive:
        bsdf.inputs["Emission Color"].default_value = (r, g, b, 1)
        bsdf.inputs["Emission Strength"].default_value = emissive
    return m


SEP = "__"


def set_prefix(card, on):
    """Les noms d'objets sont uniques dans un fichier Blender : hors export,
    les objets d'une carte sont préfixés (valere__leg_L) pour que chaque
    carte puisse avoir son propre leg_L au moment de son export."""
    col = bpy.data.collections.get(card)
    if not col:
        return
    for o in col.objects:
        bare = o.name.split(SEP, 1)[1] if SEP in o.name else o.name
        o.name = f"{card}{SEP}{bare}" if on else bare


def isolate(card):
    for other in BUILDERS:
        if other != card:
            set_prefix(other, True)


class Builder:
    def __init__(self, name):
        isolate(name)
        self.col = bpy.data.collections.get(name)
        if self.col:
            for o in list(self.col.objects):
                bpy.data.objects.remove(o, do_unlink=True)
        else:
            self.col = bpy.data.collections.new(name)
            bpy.context.scene.collection.children.link(self.col)
        self.root = self.empty(name, (0, 0, 0))

    def _link(self, obj, parent, loc):
        for c in obj.users_collection:
            c.objects.unlink(obj)
        self.col.objects.link(obj)
        if parent is not None:
            obj.parent = parent
        obj.location = loc
        return obj

    def empty(self, name, loc, parent=None):
        e = bpy.data.objects.new(name, None)
        e.empty_display_type = "PLAIN_AXES"
        e.empty_display_size = 0.12
        return self._link(e, parent if parent is not None else getattr(self, "root", None), loc)

    def _finish(self, name, mat, parent, loc, rot, smooth, bevel):
        o = bpy.context.active_object
        o.name = name
        o.data.name = name
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        o.rotation_euler = rot
        o.data.materials.append(mat)
        if bevel:
            mod = o.modifiers.new("Bevel", "BEVEL")
            mod.width = bevel
            mod.segments = 1
        if smooth:
            bpy.ops.object.shade_smooth()
        else:
            bpy.ops.object.shade_flat()
        return self._link(o, parent if parent is not None else self.root, loc)

    def box(self, name, size, loc, mat, parent=None, rot=(0, 0, 0), bevel=0.015):
        bpy.ops.mesh.primitive_cube_add(size=1, scale=size)
        return self._finish(name, mat, parent, loc, rot, False, bevel)

    def cyl(self, name, r, depth, loc, mat, parent=None, rot=(0, 0, 0), verts=10, r2=None, smooth=True):
        if r2 is None:
            bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth)
        else:
            bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth)
        return self._finish(name, mat, parent, loc, rot, smooth, 0)

    def sphere(self, name, r, loc, mat, parent=None, scale=(1, 1, 1), seg=10, rings=6, smooth=True):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, scale=scale)
        return self._finish(name, mat, parent, loc, (0, 0, 0), smooth, 0)

    def export(self, path):
        export_collection(self.col, path)


def export_collection(col, path):
    bpy.ops.object.select_all(action="DESELECT")
    for o in col.objects:
        o.hide_set(False)
        o.select_set(True)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_extras=False,
    )
    print("Exporté :", path)


# ------------------------------------------------------------------- Valère

def build_valere(b):
    body = material("valere_body", 0x4a4f63, roughness=0.75)
    pants = material("valere_pants", 0x23263a, roughness=0.85)
    team = material("team", 0x3b8cff, roughness=0.45)
    steel = material("valere_steel", 0x9aa0ab, metallic=0.8, roughness=0.3)
    blade = material("valere_blade", 0xd9dde6, metallic=0.9, roughness=0.18)
    orange = material("valere_orange", 0xff7a1a, roughness=0.5)
    leather = material("valere_leather", 0x4a2f1e, roughness=0.9)
    skin = material("valere_skin", 0xe0b089, roughness=0.7)

    FWD = -1  # l'avant est -Y

    # Jambes : pivot à la hanche, la géométrie pend en dessous.
    for side, sx in (("L", -1), ("R", 1)):
        leg = b.empty(f"leg_{side}", (sx * 0.13, 0, 0.48))
        b.box(f"thigh_{side}", (0.19, 0.22, 0.36), (0, 0, -0.18), pants, leg)
        b.box(f"boot_{side}", (0.23, 0.33, 0.15), (0, FWD * 0.04, -0.405), leather, leg)
        b.box(f"knee_{side}", (0.17, 0.05, 0.1), (0, FWD * 0.115, -0.2), steel, leg)

    # Bassin, torse, plastron.
    b.box("hips", (0.44, 0.27, 0.14), (0, 0, 0.5), pants)
    b.box("torso", (0.58, 0.36, 0.48), (0, 0, 0.79), body, bevel=0.05)
    b.box("chestplate", (0.48, 0.06, 0.36), (0, FWD * 0.19, 0.83), steel, bevel=0.02)
    b.box("chest_stripe", (0.08, 0.02, 0.3), (0, FWD * 0.225, 0.83), orange, bevel=0)
    b.box("belt", (0.62, 0.4, 0.08), (0, 0, 0.57), team, bevel=0.01)
    b.box("buckle", (0.12, 0.03, 0.09), (0, FWD * 0.205, 0.57), steel, bevel=0)
    b.cyl("collar", 0.19, 0.07, (0, 0, 1.05), team, verts=12)

    # Bras : pivot à l'épaule. arm_R tient l'épée.
    for side, sx in (("L", -1), ("R", 1)):
        arm = b.empty(f"arm_{side}", (sx * 0.37, 0, 0.98))
        b.sphere(f"pauldron_{side}", 0.16, (sx * 0.02, 0, 0.02), steel, arm, scale=(1, 1, 0.75), seg=8, rings=5, smooth=False)
        b.cyl(f"pauldron_trim_{side}", 0.165, 0.035, (sx * 0.02, 0, -0.05), orange, arm, verts=8)
        b.cyl(f"upperarm_{side}", 0.08, 0.3, (0, 0, -0.18), body, arm, verts=8)
        b.cyl(f"gauntlet_{side}", 0.1, 0.15, (0, 0, -0.33), steel, arm, verts=8, r2=0.085)
        b.sphere(f"hand_{side}", 0.085, (0, 0, -0.43), skin, arm, seg=8, rings=5)

    # Épée à deux mains, tenue vers l'avant comme dans le modèle d'origine.
    arm_r = b.col.objects["arm_R"]
    sword = b.empty("sword", (0, 0, -0.43), arm_r)
    b.cyl("grip", 0.032, 0.2, (0, FWD * 0.02, 0), leather, sword, rot=(math.pi / 2, 0, 0), verts=6)
    b.box("pommel", (0.07, 0.07, 0.07), (0, -FWD * 0.13, 0), orange, sword, bevel=0.01)
    b.box("crossguard", (0.36, 0.07, 0.08), (0, FWD * 0.12, 0), orange, sword, bevel=0.01)
    b.box("blade", (0.13, 0.82, 0.035), (0, FWD * 0.57, 0), blade, sword, bevel=0.008)
    b.box("fuller", (0.03, 0.66, 0.04), (0, FWD * 0.53, 0), steel, sword, bevel=0)
    b.cyl("tip", 0.066, 0.16, (0, FWD * 1.06, 0), blade, sword, rot=(math.pi / 2 * -FWD, 0, 0),
          verts=4, r2=0.0, smooth=False)
    tip = b.col.objects["tip"]
    tip.scale = (1, 0.27, 1)  # aplatit la pointe à l'épaisseur de la lame

    # Où le jeu place la photo ronde.
    b.empty("head_anchor", (0, 0, 1.4))


# ------------------------------------------------------------ base commune

def humanoid(b, p, torso=(0.5, 0.32, 0.46), shoulder=0.34, hip=0.12, arm_r=0.075,
             belt=True, collar=True, sleeves=None):
    """Corps standard : jambes, bassin, torse, bras. p = dict de matériaux
    (body, pants, shoes, skin, team). Renvoie les pivots."""
    w, d, h = torso
    top = 0.56 + h
    legs = {}
    for side, sx in (("L", -1), ("R", 1)):
        leg = b.empty(f"leg_{side}", (sx * hip, 0, 0.48))
        b.box(f"thigh_{side}", (0.17, 0.2, 0.36), (0, 0, -0.18), p["pants"], leg)
        b.box(f"shoe_{side}", (0.2, 0.3, 0.12), (0, -0.04, -0.42), p["shoes"], leg)
        legs[side] = leg
    b.box("hips", (w * 0.8, d * 0.85, 0.14), (0, 0, 0.5), p["pants"])
    b.box("torso", (w, d, h), (0, 0, 0.56 + h / 2), p["body"], bevel=0.04)
    if belt:
        b.box("belt", (w + 0.04, d + 0.04, 0.08), (0, 0, 0.58), p["team"], bevel=0.01)
    if collar:
        b.cyl("collar", 0.17, 0.06, (0, 0, top + 0.02), p["team"], verts=10)
    arms = {}
    for side, sx in (("L", -1), ("R", 1)):
        arm = b.empty(f"arm_{side}", (sx * shoulder, 0, top - 0.04))
        b.cyl(f"upperarm_{side}", arm_r, 0.34, (0, 0, -0.19), sleeves or p["body"], arm, verts=8)
        b.sphere(f"hand_{side}", 0.08, (0, 0, -0.42), p["skin"], arm, seg=8, rings=5)
        arms[side] = arm
    b.empty("head_anchor", (0, 0, 1.4))
    return {"arm_L": arms["L"], "arm_R": arms["R"], "leg_L": legs["L"], "leg_R": legs["R"], "top": top}


def cape(b, mat, width, length, top, back=0.18):
    """Cape accrochée en haut du dos ; l'Empty 'cape' est le pivot animé par le jeu."""
    piv = b.empty("cape", (0, back, top))
    bpy.ops.mesh.primitive_plane_add(size=1, scale=(width, length, 1))
    o = b._finish("cape_cloth", mat, piv, (0, 0, -length / 2), (math.pi / 2, 0, 0), True, 0)
    sub = o.modifiers.new("Sub", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 1
    sub.subdivision_type = "SIMPLE"
    return piv


def base_mats(prefix, body, pants=0x23263a, shoes=0xf2f2f2, skin=0xe0b089, body_rough=0.75):
    return {
        "body": material(f"{prefix}_body", body, roughness=body_rough),
        "pants": material(f"{prefix}_pants", pants, roughness=0.85),
        "shoes": material(f"{prefix}_shoes", shoes, roughness=0.8),
        "skin": material(f"{prefix}_skin", skin, roughness=0.7),
        "team": material("team", 0x3b8cff, roughness=0.45),
    }


# ------------------------------------------------------------------- Goutier
# Essaim de 10 : on reste très léger (~400 triangles).

def build_goutier(b):
    p = base_mats("goutier", 0x1b1e26, pants=0x2c3a55, shoes=0xf2f2f2, body_rough=0.55)
    seam = material("goutier_seam", 0x3a3f4d, roughness=0.6)
    h = humanoid(b, p, torso=(0.5, 0.36, 0.46), shoulder=0.35, arm_r=0.095, belt=False, collar=False)
    # Doudoune : boudins horizontaux autour du torse.
    for i, z in enumerate((0.64, 0.79, 0.94)):
        b.cyl(f"puff_{i}", 0.3 - i * 0.015, 0.13, (0, 0, z), p["body"], verts=8)
        b.cyl(f"seam_{i}", 0.285 - i * 0.015, 0.03, (0, 0, z + 0.075), seam, verts=8)
    b.box("zip", (0.04, 0.03, 0.42), (0, -0.29, 0.8), p["team"], bevel=0)
    b.cyl("collar", 0.21, 0.12, (0, 0, 1.06), p["team"], verts=8)
    # Capuche rabattue dans le dos.
    b.sphere("hood", 0.2, (0, 0.2, 1.08), p["body"], scale=(1.2, 0.7, 0.8), seg=6, rings=4, smooth=False)
    for side in ("L", "R"):
        b.cyl(f"cuff_{side}", 0.1, 0.06, (0, 0, -0.34), p["team"], h[f"arm_{side}"], verts=8)


# --------------------------------------------------------------------- Midas

def build_midas(b):
    p = base_mats("midas", 0x2f5d3a, pants=0x1f2a1f, shoes=0x3b2a1c)
    gold = material("midas_gold", 0xd4af37, metallic=0.85, roughness=0.3)
    leather = material("midas_leather", 0x5a3a22, roughness=0.9)
    steel = material("midas_steel", 0xd9dde6, metallic=0.85, roughness=0.25)
    cloak = material("midas_cloak", 0x244a2e, roughness=0.8)
    h = humanoid(b, p, torso=(0.46, 0.3, 0.44), shoulder=0.32, belt=False)
    b.box("belt", (0.5, 0.34, 0.07), (0, 0, 0.6), gold, bevel=0.01)
    b.box("sash", (0.08, 0.32, 0.5), (0.08, 0, 0.82), p["team"], rot=(0, 0.6, 0), bevel=0)
    for i, x in enumerate((-0.2, 0.2)):
        b.box(f"pouch_{i}", (0.12, 0.1, 0.13), (x, -0.16, 0.52), leather, bevel=0.02)
        b.sphere(f"coin_{i}", 0.04, (x, -0.22, 0.6), gold, seg=6, rings=3, smooth=False)
    # Capuche pointue au-dessus de la tête et cape qui flotte.
    b.cyl("hood", 0.42, 0.5, (0, 0.12, 2.07), cloak, rot=(0.15, 0, 0), verts=10, r2=0.04)
    b.cyl("hood_rim", 0.43, 0.06, (0, 0.1, 1.83), gold, verts=10)
    cape(b, cloak, 0.56, 0.78, h["top"], back=0.17)
    # Dague dans la main droite, pointée vers l'avant.
    arm = h["arm_R"]
    b.box("dagger_guard", (0.18, 0.04, 0.05), (0, -0.08, -0.42), gold, arm, bevel=0)
    b.cyl("dagger_blade", 0.05, 0.38, (0, -0.28, -0.42), steel, arm, rot=(math.pi / 2, 0, 0), verts=4, r2=0.0, smooth=False)


# ------------------------------------------------------------------ Tordeux

def build_tordeux(b):
    p = base_mats("tordeux", 0x4a1c24, pants=0x1c1c22, shoes=0x111111)
    gold = material("tordeux_gold", 0xffd54a, metallic=0.9, roughness=0.25)
    glow = material("tordeux_glow", 0xffd54a, emissive=3.0)
    shirt = material("tordeux_shirt", 0xf2efe8, roughness=0.7)
    h = humanoid(b, p, torso=(0.52, 0.34, 0.47), shoulder=0.35)
    b.box("shirt", (0.16, 0.03, 0.4), (0, -0.175, 0.83), shirt, bevel=0)
    for i, z in enumerate((0.72, 0.84, 0.96)):
        b.sphere(f"button_{i}", 0.025, (0, -0.195, z), gold, seg=6, rings=3, smooth=False)
    b.box("bowtie", (0.16, 0.04, 0.07), (0, -0.19, 1.0), p["team"], bevel=0.01)
    # Le Doigt d'Or : gant doré, index tendu, bout lumineux.
    arm = h["arm_R"]
    b.cyl("glove", 0.1, 0.14, (0, 0, -0.38), gold, arm, verts=8)
    b.box("fist", (0.15, 0.15, 0.12), (0, 0, -0.48), gold, arm, bevel=0.03)
    b.cyl("finger", 0.03, 0.18, (0, 0, -0.62), gold, arm, verts=6)
    b.sphere("fingertip", 0.07, (0, 0, -0.74), glow, arm, seg=8, rings=5)
    b.box("watch", (0.17, 0.17, 0.05), (0, 0, -0.33), gold, h["arm_L"], bevel=0.01)


# -------------------------------------------------------------------- Natis

def build_natis(b):
    p = base_mats("natis", 0x141414, pants=0x1c1d22, shoes=0xd8d8d8, body_rough=0.9)
    grey = material("natis_grey", 0x2a2a2e, roughness=0.9)
    white = material("natis_white", 0xd8d8d8, roughness=0.6)
    h = humanoid(b, p, torso=(0.74, 0.44, 0.5), shoulder=0.45, hip=0.15, arm_r=0.11)
    b.box("pocket", (0.42, 0.04, 0.16), (0, -0.23, 0.68), grey, bevel=0.02)
    b.box("hem", (0.76, 0.46, 0.08), (0, 0, 0.6), p["team"], bevel=0.01)
    b.sphere("hood", 0.24, (0, 0.2, 1.07), p["body"], scale=(1.4, 0.8, 0.7), seg=8, rings=5)
    for side, x in (("L", -0.07), ("R", 0.07)):
        b.cyl(f"string_{side}", 0.014, 0.22, (x, -0.23, 0.95), white, verts=4)
        b.sphere(f"aglet_{side}", 0.022, (x, -0.235, 0.83), white, seg=4, rings=3, smooth=False)
    for side in ("L", "R"):
        arm = h[f"arm_{side}"]
        b.sphere(f"shoulder_{side}", 0.15, (0, 0, -0.02), p["body"], arm, seg=8, rings=5)
        b.cyl(f"cuff_{side}", 0.115, 0.07, (0, 0, -0.34), p["team"], arm, verts=8)
        b.sphere(f"fist_{side}", 0.11, (0, 0, -0.43), p["skin"], arm, seg=8, rings=5)


# --------------------------------------------------------------- Super Samy

def build_samy(b):
    p = base_mats("samy", 0x1f5fd1, pants=0x1f5fd1, shoes=0xd62b2b, body_rough=0.5)
    red = material("samy_red", 0xd62b2b, roughness=0.55)
    yellow = material("samy_yellow", 0xffd400, roughness=0.4)
    h = humanoid(b, p, torso=(0.54, 0.34, 0.47), shoulder=0.36, belt=False, collar=False)
    b.box("briefs", (0.46, 0.3, 0.13), (0, 0, 0.5), red, bevel=0.02)
    b.box("belt", (0.58, 0.38, 0.06), (0, 0, 0.6), yellow, bevel=0.01)
    b.box("team_band", (0.585, 0.385, 0.025), (0, 0, 0.6), p["team"], bevel=0)
    b.cyl("emblem", 0.15, 0.03, (0, -0.175, 0.86), yellow, rot=(math.pi / 2, 0, 0), verts=5, smooth=False)
    b.cyl("emblem_s", 0.09, 0.035, (0, -0.18, 0.86), red, rot=(math.pi / 2, 0, 0), verts=5, smooth=False)
    for side in ("L", "R"):
        b.cyl(f"boot_{side}", 0.1, 0.22, (0, 0, -0.32), red, h[f"leg_{side}"], verts=8)
        b.cyl(f"glove_{side}", 0.085, 0.12, (0, 0, -0.33), red, h[f"arm_{side}"], verts=8)
    cape(b, red, 0.66, 0.92, h["top"], back=0.18)


# -------------------------------------------------------------------- Nazar

def build_nazar(b):
    p = base_mats("nazar", 0x1d2a4a, pants=0x1d2a4a, shoes=0x4a2f1e)
    blue = material("nazar_shirt", 0x9ec3ff, roughness=0.7)
    hat = material("nazar_hat", 0xffc21a, roughness=0.45)
    lamp = material("nazar_lamp", 0xfff4d0, emissive=2.0)
    wood = material("nazar_wood", 0x7b4f2a, roughness=0.9)
    iron = material("nazar_iron", 0x8a8f99, metallic=0.8, roughness=0.3)
    canvas = material("nazar_canvas", 0x6b5a3a, roughness=0.95)
    h = humanoid(b, p, torso=(0.52, 0.34, 0.47), shoulder=0.35, sleeves=blue)
    b.box("bib", (0.34, 0.03, 0.26), (0, -0.175, 0.86), p["body"], bevel=0)
    for x in (-0.13, 0.13):
        b.box(f"strap_{x:+.2f}", (0.06, 0.36, 0.03), (x, 0, 1.03), p["body"], bevel=0)
    b.box("backpack", (0.36, 0.16, 0.36), (0, 0.24, 0.84), canvas, bevel=0.04)
    # Casque de chantier posé sur la photo.
    b.sphere("helmet", 0.4, (0, 0, 1.82), hat, scale=(1, 1, 0.55), seg=12, rings=6)
    b.cyl("brim", 0.47, 0.04, (0, 0, 1.8), hat, verts=12)
    b.cyl("headlamp", 0.08, 0.06, (0, -0.4, 1.86), lamp, rot=(math.pi / 2, 0, 0), verts=8)
    # Pioche tenue vers l'avant.
    arm = h["arm_R"]
    b.cyl("handle", 0.035, 0.9, (0, -0.38, -0.42), wood, arm, rot=(math.pi / 2, 0, 0), verts=6)
    b.cyl("pick", 0.045, 0.62, (0, -0.8, -0.42), iron, arm, verts=6, r2=0.012, smooth=False)
    b.box("pick_head", (0.08, 0.1, 0.1), (0, -0.8, -0.42), iron, arm, bevel=0.01)


# ------------------------------------------------------------------- Savy

def build_savy(b):
    p = base_mats("savy", 0x2b2d33, pants=0x1c1d22, shoes=0x3b2a1c)
    orange = material("savy_orange", 0xff7a1a, roughness=0.5)
    fire = material("savy_fire", 0xff7a1a, emissive=3.0)
    core = material("savy_core", 0xfff3b0, emissive=4.0)
    h = humanoid(b, p, torso=(0.48, 0.32, 0.46), shoulder=0.33, belt=False)
    b.cyl("robe", 0.3, 0.42, (0, 0, 0.42), p["body"], verts=10, r2=0.22)
    b.box("belt", (0.5, 0.34, 0.07), (0, 0, 0.6), p["team"], bevel=0.01)
    b.box("trim", (0.06, 0.03, 0.44), (0, -0.165, 0.82), orange, bevel=0)
    # Chapeau de sorcier au-dessus de la photo.
    b.cyl("hat_brim", 0.5, 0.04, (0, 0, 1.9), p["body"], verts=12)
    b.cyl("hat", 0.3, 0.6, (0, 0.04, 2.21), p["body"], rot=(0.18, 0, 0), verts=10, r2=0.02)
    b.cyl("hat_band", 0.305, 0.07, (0, 0, 1.95), orange, verts=10)
    # Orbe de feu dans la main droite.
    arm = h["arm_R"]
    b.sphere("orb", 0.16, (0, -0.12, -0.5), fire, arm, seg=10, rings=6)
    b.sphere("orb_core", 0.08, (0, -0.12, -0.5), core, arm, seg=8, rings=4)
    for side in ("L", "R"):
        b.cyl(f"sleeve_{side}", 0.11, 0.1, (0, 0, -0.32), orange, h[f"arm_{side}"], verts=8, r2=0.13)


# -------------------------------------------------------------- Tarit à pied

def build_taritPilot(b):
    p = base_mats("taritpilot", 0xc8b496, pants=0x2c3a55, shoes=0x5a3a22)
    tee = material("taritpilot_tee", 0x1c1c1c, roughness=0.8)
    brown = material("taritpilot_brown", 0x8a7458, roughness=0.8)
    chrome = material("taritpilot_chrome", 0xc0c4cc, metallic=0.9, roughness=0.2)
    soot = material("taritpilot_soot", 0x2a2522, roughness=1.0)
    h = humanoid(b, p, torso=(0.52, 0.34, 0.47), shoulder=0.35)
    b.box("tee", (0.2, 0.03, 0.4), (0, -0.175, 0.83), tee, bevel=0)
    b.box("collar_flap_L", (0.12, 0.04, 0.16), (-0.1, -0.18, 0.98), brown, rot=(0, 0, 0.4), bevel=0)
    b.box("collar_flap_R", (0.12, 0.04, 0.16), (0.1, -0.18, 0.98), brown, rot=(0, 0, -0.4), bevel=0)
    b.box("soot_1", (0.14, 0.02, 0.1), (0.15, -0.175, 0.7), soot, bevel=0)
    b.box("soot_2", (0.1, 0.02, 0.08), (-0.17, 0.175, 0.9), soot, bevel=0)
    # Clés de la Duster.
    arm = h["arm_R"]
    b.cyl("keyring", 0.04, 0.01, (0, -0.06, -0.5), chrome, arm, rot=(math.pi / 2, 0, 0), verts=8)
    b.box("key", (0.03, 0.01, 0.1), (0, -0.06, -0.58), chrome, arm, bevel=0)
    b.box("fob", (0.06, 0.03, 0.08), (0.05, -0.06, -0.57), tee, arm, bevel=0.01)


# --------------------------------------------------------------- QG d'Imad
# Bâtiment : pas de bras ni de jambes ; 'bulb' clignote quand il tire.

def build_imad(b):
    brick = material("imad_brick", 0x8a7458, roughness=0.9)
    stone = material("imad_stone", 0xc8bca8, roughness=0.9)
    navy = material("imad_navy", 0x23263a, roughness=0.6)
    wood = material("imad_wood", 0x6b4423, roughness=0.9)
    window = material("imad_window", 0xffe9a8, emissive=0.6)
    bulb = material("imad_bulb", 0xfff3a0, emissive=0.6)
    metal = material("imad_metal", 0x8a8f99, metallic=0.8, roughness=0.35)
    team = material("team", 0x3b8cff, roughness=0.45)
    b.box("base", (1.75, 1.75, 1.3), (0, 0, 0.65), brick, bevel=0.03)
    b.box("plinth", (1.85, 1.85, 0.16), (0, 0, 0.08), stone, bevel=0.02)
    b.box("roof", (1.95, 1.95, 0.14), (0, 0, 1.37), stone, bevel=0.02)
    b.box("roof_band", (1.97, 1.97, 0.07), (0, 0, 1.3), team, bevel=0)
    b.box("attic", (1.1, 1.1, 0.4), (0, 0.15, 1.64), brick, bevel=0.03)
    b.box("attic_roof", (1.2, 1.2, 0.08), (0, 0.15, 1.88), team, bevel=0.01)
    b.box("door", (0.46, 0.06, 0.72), (0, -0.88, 0.44), wood, bevel=0.01)
    b.box("door_frame", (0.56, 0.05, 0.8), (0, -0.87, 0.48), stone, bevel=0)
    for side, x in (("L", -0.55), ("R", 0.55)):
        b.box(f"window_{side}", (0.34, 0.06, 0.34), (x, -0.88, 0.84), window, bevel=0)
        b.box(f"sill_{side}", (0.42, 0.1, 0.05), (x, -0.9, 0.65), stone, bevel=0)
        b.box(f"side_window_{side}", (0.06, 0.34, 0.34), (x * 1.6, 0.0, 0.84), window, bevel=0)
    # Enseigne « QG » en relief.
    b.box("sign", (1.0, 0.05, 0.3), (0, -0.9, 1.17), navy, bevel=0.01)
    gold = material("imad_gold", 0xffcf3f, roughness=0.4)
    def bar(n, x, z, w, hgt):
        b.box(n, (w, 0.03, hgt), (x, -0.935, z), gold, bevel=0)
    # Q
    bar("q_t", -0.17, 1.27, 0.2, 0.04); bar("q_b", -0.17, 1.07, 0.2, 0.04)
    bar("q_l", -0.25, 1.17, 0.04, 0.2); bar("q_r", -0.09, 1.17, 0.04, 0.2)
    b.box("q_tail", (0.12, 0.03, 0.035), (-0.07, -0.935, 1.06), gold, rot=(0, 0.7, 0), bevel=0)
    # G
    bar("g_t", 0.17, 1.27, 0.2, 0.04); bar("g_b", 0.17, 1.07, 0.2, 0.04)
    bar("g_l", 0.09, 1.17, 0.04, 0.2); bar("g_r", 0.25, 1.12, 0.04, 0.1)
    bar("g_m", 0.21, 1.15, 0.1, 0.04)
    # Mât et ampoule « idée ».
    b.cyl("pole", 0.05, 2.0, (0.85, 0.6, 2.35), metal, verts=6)
    b.cyl("socket", 0.09, 0.14, (0.85, 0.6, 3.42), metal, verts=8)
    b.sphere("bulb", 0.2, (0.85, 0.6, 3.6), bulb, seg=12, rings=8)
    b.empty("head_anchor", (0, 0, 3.0))


# ---------------------------------------------------------- Duster de Tarit
# Véhicule : les roues sont des pivots 'wheel_*' tournés par le jeu.

def build_tarit(b):
    paint = material("tarit_paint", 0x121417, metallic=0.55, roughness=0.32)
    plastic = material("tarit_plastic", 0x26282c, roughness=0.9)
    glass = material("tarit_glass", 0x1b2633, metallic=0.9, roughness=0.08)
    chrome = material("tarit_chrome", 0xc0c4cc, metallic=0.9, roughness=0.2)
    tire = material("tarit_tire", 0x141414, roughness=0.95)
    light = material("tarit_light", 0xfff4d0, emissive=1.6)
    tail = material("tarit_tail", 0xff2a2a, emissive=1.2)
    plate = material("tarit_plate", 0xf4f4f4, roughness=0.6)
    team = material("team", 0x3b8cff, roughness=0.4)
    F = -1  # avant = -Y
    b.box("body", (1.5, 2.9, 0.72), (0, 0, 0.8), paint, bevel=0.08)
    b.box("hood", (1.44, 0.95, 0.16), (0, F * 0.95, 1.16), paint, rot=(F * -0.12, 0, 0), bevel=0.04)
    b.box("skirt", (1.6, 3.0, 0.26), (0, 0, 0.48), plastic, bevel=0.03)
    for i, y in enumerate((0.98, -0.98)):
        b.box(f"arch_{i}", (1.64, 0.95, 0.5), (0, y, 0.62), plastic, bevel=0.05)
    b.box("cabin", (1.36, 1.75, 0.6), (0, 0.25, 1.45), glass, bevel=0.05)
    b.box("pillar_f", (1.38, 0.08, 0.6), (0, -0.6, 1.45), paint, rot=(-0.35, 0, 0), bevel=0)
    b.box("roof", (1.42, 1.85, 0.08), (0, 0.25, 1.79), paint, bevel=0.03)
    for x in (-0.55, 0.55):
        b.box(f"rail_{'L' if x < 0 else 'R'}", (0.06, 1.6, 0.08), (x, 0.25, 1.88), chrome, bevel=0)
    for side, sx in (("L", -1), ("R", 1)):
        b.box(f"stripe_{side}", (0.03, 2.6, 0.14), (sx * 0.765, 0, 0.9), team, bevel=0)
        b.box(f"step_{side}", (0.12, 1.6, 0.06), (sx * 0.83, 0.1, 0.36), chrome, bevel=0)
        b.box(f"mirror_{side}", (0.18, 0.08, 0.12), (sx * 0.83, F * 0.55, 1.3), paint, bevel=0.02)
    b.box("grille", (1.0, 0.06, 0.3), (0, F * 1.47, 0.88), chrome, bevel=0.01)
    for i in range(3):
        b.box(f"grille_bar_{i}", (0.96, 0.07, 0.03), (0, F * 1.48, 0.8 + i * 0.08), plastic, bevel=0)
    b.box("skid", (1.1, 0.08, 0.14), (0, F * 1.5, 0.5), chrome, bevel=0.02)
    for x in (-0.55, 0.55):
        b.box(f"headlight_{'L' if x < 0 else 'R'}", (0.32, 0.06, 0.14), (x, F * 1.47, 0.98), light, bevel=0.01)
        b.box(f"taillight_{'L' if x < 0 else 'R'}", (0.22, 0.06, 0.2), (x * 1.15, -F * 1.47, 0.95), tail, bevel=0.01)
    b.box("plate", (0.5, 0.04, 0.13), (0, F * 1.52, 0.62), plate, bevel=0)
    b.box("spare", (0.5, 0.12, 0.5), (0, -F * 1.52, 0.9), tire, bevel=0.1)
    for name, x, y in (("FL", -0.74, F * 0.98), ("FR", 0.74, F * 0.98), ("RL", -0.74, -F * 0.98), ("RR", 0.74, -F * 0.98)):
        w = b.empty(f"wheel_{name}", (x, y, 0.38))
        b.cyl(f"tire_{name}", 0.38, 0.3, (0, 0, 0), tire, w, rot=(0, math.pi / 2, 0), verts=14)
        b.cyl(f"rim_{name}", 0.22, 0.32, (0, 0, 0), chrome, w, rot=(0, math.pi / 2, 0), verts=8, smooth=False)
    b.empty("head_anchor", (0, 0.3, 2.45))


BUILDERS = {
    "valere": build_valere,
    "goutier": build_goutier,
    "midas": build_midas,
    "tordeux": build_tordeux,
    "natis": build_natis,
    "samy": build_samy,
    "nazar": build_nazar,
    "savy": build_savy,
    "taritPilot": build_taritPilot,
    "imad": build_imad,
    "tarit": build_tarit,
}


def out_path(card):
    return os.path.join(project_dir(), "client", "public", "models", f"{card}.glb")


def main():
    cards = list(BUILDERS) if CARD == "all" else [CARD]
    for card in cards:
        if card not in BUILDERS:
            raise SystemExit(f"Carte inconnue : {card} (dispo : all, {', '.join(BUILDERS)})")
        if EXPORT_ONLY:
            # Ré-exporte la collection telle que tu l'as retouchée à la main.
            isolate(card)
            set_prefix(card, False)
            col = bpy.data.collections[card]
            root = bpy.data.objects.get(card)
            saved = root.location.copy() if root else None
            if root:
                root.location = (0, 0, 0)
            export_collection(col, out_path(card))
            if root:
                root.location = saved
        else:
            b = Builder(card)
            BUILDERS[card](b)
            b.export(out_path(card))
            # Collections décalées pour les voir côte à côte dans Blender.
            if len(cards) > 1:
                b.root.location.x = cards.index(card) * 2.5
        set_prefix(card, True)


main()
