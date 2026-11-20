"""
Génère un personnage low-poly pour USMB Arena et l'exporte en .glb.

Dans Blender : onglet Scripting > Open > ce fichier > Run Script (Alt+P).
En ligne de commande : blender -b -P tools/blender/build_unit.py -- valere

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

CARD = "valere"
if "--" in sys.argv:
    args = sys.argv[sys.argv.index("--") + 1:]
    if args:
        CARD = args[0]

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


class Builder:
    def __init__(self, name):
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
        bpy.ops.object.select_all(action="DESELECT")
        for o in self.col.objects:
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


BUILDERS = {"valere": build_valere}


def main():
    if CARD not in BUILDERS:
        raise SystemExit(f"Carte inconnue : {CARD} (dispo : {', '.join(BUILDERS)})")
    b = Builder(CARD)
    BUILDERS[CARD](b)
    out = os.path.join(project_dir(), "client", "public", "models", f"{CARD}.glb")
    b.export(out)


main()
