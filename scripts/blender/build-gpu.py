"""Build an editable fictional GPU in Blender, render it, and export a self-contained GLB.

Run: blender --background --factory-startup --python scripts/blender/build-gpu.py
Blender Z-up is converted to glTF Y-up by the exporter. Dimensions are visual units.
"""
import json
import math
from pathlib import Path
import struct

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "examples/assets/gpu"
OUTPUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
bpy.context.preferences.filepaths.save_version = 0
scene.name = "GPU_Explode"
scene.render.fps = 30
scene.frame_start, scene.frame_end = 1, 241
asset_objects = []


def material(name, color, metallic=0.0, roughness=0.4):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return mat


shell = material("Graphite anodized alloy", (0.055, 0.075, 0.095), 0.8, 0.32)
silver = material("Brushed aluminum", (0.52, 0.61, 0.68), 0.95, 0.3)
copper = material("Copper heat pipes", (0.68, 0.25, 0.09), 0.96, 0.25)
gold = material("Gold plated contacts", (0.7, 0.46, 0.11), 0.9, 0.3)
pcb_mat = material("PCB solder mask", (0.018, 0.09, 0.066), 0.15, 0.46)
plastic = material("Fan polymer", (0.017, 0.024, 0.033), 0.15, 0.38)
chip_mat = material("Chip ceramic", (0.025, 0.029, 0.035), 0.35, 0.3)
teal = material("Turquoise trim", (0.02, 0.45, 0.5), 0.55, 0.27)
white = material("Lettering", (0.7, 0.81, 0.85), 0.4, 0.35)
for mat in (shell, silver):
    texture = mat.node_tree.nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(ROOT / "examples/assets/materials/brushed-normal.png"), check_existing=True)
    texture.image.colorspace_settings.name = "Non-Color"
    normal = mat.node_tree.nodes.new("ShaderNodeNormalMap")
    normal.inputs["Strength"].default_value = 0.12
    mat.node_tree.links.new(texture.outputs["Color"], normal.inputs["Color"])
    mat.node_tree.links.new(normal.outputs["Normal"], mat.node_tree.nodes.get("Principled BSDF").inputs["Normal"])


def register(obj, name, parent=None, mat=None):
    obj.name = name
    if parent:
        obj.parent = parent
    if mat:
        obj.data.materials.append(mat)
    asset_objects.append(obj)
    return obj


def group(name):
    obj = bpy.data.objects.new(name, None)
    scene.collection.objects.link(obj)
    return register(obj, name)


def bevel(obj, width=0.04, segments=3):
    mod = obj.modifiers.new("Machined edge radius", "BEVEL")
    mod.width, mod.segments = width, segments
    mod = obj.modifiers.new("Face weighted normals", "WEIGHTED_NORMAL")
    mod.keep_sharp = True


def box(name, position, size, mat, parent, radius=0.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = register(bpy.context.object, name, parent, mat)
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if radius:
        bevel(obj, min(radius, min(size) * 0.2))
    return obj


def cylinder(name, position, radius, depth, mat, parent, vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=position)
    obj = register(bpy.context.object, name, parent, mat)
    for face in obj.data.polygons:
        face.use_smooth = len(face.vertices) == 4
    bevel(obj, min(0.014, depth * 0.15), 2)
    return obj


def torus(name, position, radius, thickness, mat, parent):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=thickness,
                                   major_segments=64, minor_segments=10, location=position)
    obj = register(bpy.context.object, name, parent, mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def curve(name, points, radius, mat, parent):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions, data.bevel_depth, data.bevel_resolution = "3D", radius, 3
    data.resolution_u = 12
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for p, co in zip(spline.bezier_points, points):
        p.co = co
        p.handle_left_type = p.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    register(obj, name, parent, mat)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    return obj


def text(name, body, position, size, mat, parent, rotation=(0, 0, 0)):
    bpy.ops.object.text_add(location=position, rotation=rotation)
    obj = bpy.context.object
    obj.data.body, obj.data.size, obj.data.extrude = body, size, 0.002
    obj.data.align_x = "CENTER"
    obj.data.resolution_u = 4
    bpy.ops.object.convert(target="MESH")
    return register(bpy.context.object, name, parent, mat)


board = group("01_PCB_and_components")
cooler = group("02_Heatsink_and_heatpipes")
cover = group("03_Shroud_and_fans")
box("Main PCB", (0, 0, 0.1), (6.8, 2.85, 0.12), pcb_mat, board)
box("GPU substrate", (0, 0, 0.23), (1.4, 1.35, 0.13), chip_mat, board)
box("GPU silicon die", (0, 0, 0.32), (0.82, 0.8, 0.06), silver, board, 0.006)
text("GPU die mark", "GX", (0, -0.11, 0.354), 0.24, chip_mat, board)
for x in (-1.1, 1.1):
    for y in (-0.85, -0.28, 0.29, 0.86):
        box("Memory package", (x, y, 0.23), (0.52, 0.43, 0.13), chip_mat, board)
        text("Memory silkscreen", "HBM", (x, y - 0.035, 0.302), 0.1, white, board)
for x in (-2.65, -2.15, 2.15, 2.65):
    for y in (-0.92, -0.3, 0.32, 0.94):
        cylinder("Capacitor", (x, y, 0.29), 0.085, 0.24, silver, board, 16)
        box("Capacitor top score", (x, y, 0.415), (0.095, 0.012, 0.004), chip_mat, board, 0)
        box("Power stage", (x + 0.2, y, 0.24), (0.17, 0.26, 0.15), plastic, board)
for i in range(38):
    x = -2.7 + i * 0.12
    if 14 <= i <= 15:
        continue
    box("PCIe contact", (x, -1.52, 0.09), (0.075, 0.35, 0.07), gold, board, 0.006)
for sign in (-1, 1):
    for i in range(9):
        y = -1.08 + i * 0.24
        curve("PCB copper trace", [(sign * 0.76, y * 0.65, 0.169), (sign * 1.55, y, 0.169), (sign * 2.9, y, 0.169)], 0.009, gold, board)
for x in (-3.16, 3.16):
    for y in (-1.18, 1.18):
        torus("PCB mounting eyelet", (x, y, 0.177), 0.075, 0.019, gold, board)

# Open-backed I/O bracket with framed sockets, rather than painted black rectangles.
box("I/O bracket", (-3.58, 0, 0.5), (0.12, 3.3, 1.4), silver, board)
for y in (-0.95, -0.25, 0.5):
    for z in (0.36, 0.7):
        box("Connector socket top", (-3.69, y, z), (0.2, 0.5, 0.045), shell, board, 0.005)
    for dy in (-0.25, 0.25):
        box("Connector socket side", (-3.69, y + dy, 0.53), (0.2, 0.045, 0.34), shell, board, 0.005)
    box("Connector tongue", (-3.79, y, 0.5), (0.05, 0.39, 0.07), plastic, board)
    for i in range(6):
        box("Connector contact", (-3.82, y - 0.16 + i * 0.06, 0.54), (0.035, 0.025, 0.015), gold, board, 0)
box("Auxiliary power socket", (2.75, 1.39, 0.33), (0.9, 0.35, 0.35), plastic, board)
for i in range(6):
    box("Power socket recess", (2.42 + i * 0.13, 1.58, 0.35), (0.075, 0.04, 0.15), gold, board, 0.005)

box("Copper cold plate", (0, 0, 0.43), (2.5, 2.15, 0.12), copper, cooler)
for y in (-1.1, -0.7, 0.7, 1.1):
    curve("Formed copper heatpipe", [(-3.1, y, 0.62), (-2.8, y, 0.43), (-0.8, y, 0.43),
          (0.8, y, 0.43), (2.8, y, 0.43), (3.12, y, 0.68)], 0.075, copper, cooler)
for i in range(57):
    x = -3.08 + i * 0.11
    box("Aluminum cooling fin", (x, 0, 0.83), (0.036, 2.47, 0.68), silver, cooler, 0.006)
for y in (-1.27, 1.27):
    box("Heatsink retaining rail", (0, y, 0.65), (6.3, 0.05, 0.11), shell, cooler)

# A Boolean-cut shroud gives real holes with thickness. The source retains editable part meshes.
shroud = box("Machined fan shroud", (0, 0, 1.42), (7.05, 3.08, 0.23), shell, cover, 0)
for x in (-1.72, 1.72):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=1.11, depth=1, location=(x, 0, 1.42))
    cutter = bpy.context.object
    modifier = shroud.modifiers.new("Fan aperture", "BOOLEAN")
    modifier.operation, modifier.solver, modifier.object = "DIFFERENCE", "EXACT", cutter
    bpy.context.view_layer.objects.active = shroud
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
bevel(shroud, 0.045)
for y in (-1.48, 1.48):
    box("Folded shroud side", (0, y, 1.04), (7.05, 0.11, 0.68), shell, cover)
    box("Inlaid turquoise side trim", (0, y * 1.044, 1.15), (6.5, 0.04, 0.055), teal, cover, 0.01)
for x in (-3.44, 3.44):
    box("Shroud end rail", (x, 0, 1.08), (0.12, 3, 0.61), shell, cover)
for x in (-3.22, 0, 3.22):
    for y in (-1.28, 1.28):
        cylinder("Torx screw head", (x, y, 1.57), 0.065, 0.035, silver, cover, 20)
        box("Screw slot", (x, y, 1.59), (0.075, 0.016, 0.008), plastic, cover, 0)
        box("Screw cross slot", (x, y, 1.591), (0.016, 0.075, 0.008), plastic, cover, 0)
text("Top model badge", "GX / 01", (0, -0.16, 1.55), 0.25, white, cover)
text("Side model badge", "GALLEY   COMPUTE", (0, -1.552, 0.88), 0.25, white, cover, (math.pi / 2, 0, 0))

fans = []
for fan_index, x in enumerate((-1.72, 1.72)):
    torus("Fan aperture rim", (x, 0, 1.49), 1.08, 0.025, silver, cover)
    fan = group(f"Fan rotor {fan_index + 1}")
    fan.parent, fan.location = cover, (x, 0, 1.42)
    fans.append(fan)
    cylinder("Fan hub", (0, 0, 0), 0.27, 0.13, plastic, fan)
    cylinder("Fan hub inset", (0, 0, 0.075), 0.18, 0.018, teal, fan)
    for blade_index in range(9):
        verts, faces = [], []
        angle = blade_index * math.tau / 9
        # Swept, twisted blades with thickness; each strip is a quad, then triangulated on export.
        for side in (-1, 1):
            for step in range(7):
                r = 0.23 + step / 6 * 0.79
                sweep = angle + step / 6 * 0.45
                for edge in (-1, 1):
                    a = sweep + edge * (0.12 + step / 6 * 0.08)
                    z = edge * 0.055 * step / 6 + side * 0.013
                    verts.append((r * math.cos(a), r * math.sin(a), z))
        for level in (0, 14):
            for j in range(6):
                faces.append((level + j * 2, level + j * 2 + 1, level + j * 2 + 3, level + j * 2 + 2))
        for j in range(6):
            for edge in (0, 1):
                a, b = j * 2 + edge, (j + 1) * 2 + edge
                faces.append((a, b, b + 14, a + 14))
        faces += [(0, 1, 15, 14), (12, 13, 27, 26)]
        data = bpy.data.meshes.new("Swept fan blade")
        data.from_pydata(verts, [], faces)
        data.update()
        editable = bmesh.new()
        editable.from_mesh(data)
        bmesh.ops.recalc_face_normals(editable, faces=list(editable.faces))
        editable.to_mesh(data)
        editable.free()
        obj = bpy.data.objects.new("Curved fan blade", data)
        scene.collection.objects.link(obj)
        register(obj, "Curved fan blade", fan, plastic)
        for face in data.polygons:
            face.use_smooth = True

# One scene animation: assembled -> separated layers -> assembled. All is editable in Blender.
for root, lift in ((cooler, 1.65), (cover, 3.55)):
    for frame, z in ((1, 0), (46, 0), (106, lift), (166, lift), (226, 0), (241, 0)):
        root.location.z = z
        root.keyframe_insert(data_path="location", frame=frame, group="Exploded view")
for fan in fans:
    for frame, angle in ((1, 0), (241, math.tau * 6)):
        fan.rotation_euler.z = angle
        fan.keyframe_insert(data_path="rotation_euler", frame=frame, group="Fan rotation")
scene.frame_set(1)

# Pack source textures so the .blend can be moved independently.
bpy.ops.file.pack_all()
bpy.ops.object.select_all(action="DESELECT")
for obj in asset_objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = shroud
bpy.ops.export_scene.gltf(filepath=str(OUTPUT / "gpu-module.glb"), export_format="GLB",
    use_selection=True, export_apply=True, export_yup=True, export_animations=True,
    export_animation_mode="SCENE", export_anim_scene_split_object=False, export_force_sampling=True)

# Product photography setup is saved in the .blend, but is deliberately absent from the GLB.
ground = material("Studio ground", (0.035, 0.047, 0.064), 0.25, 0.32)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.08))
bpy.context.object.name = "Studio floor"
bpy.context.object.data.materials.append(ground)
world = bpy.data.worlds.new("Dark studio")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.08, 0.11, 0.16, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.4


def aim(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


for name, position, energy, color, size in [
    ("Key softbox", (1, -4, 7), 1400, (0.76, 0.88, 1), 6),
    ("Warm edge", (-4, 3, 4), 1100, (1, 0.71, 0.42), 4),
    ("Rim softbox", (4, 2, 6), 1700, (0.5, 0.78, 1), 5),
]:
    bpy.ops.object.light_add(type="AREA", location=position)
    light = bpy.context.object
    light.name, light.data.energy, light.data.color, light.data.shape, light.data.size = name, energy, color, "DISK", size
    aim(light, (0, 0, 0.5))
bpy.ops.object.camera_add(location=(8, -10, 10))
camera = bpy.context.object
camera.name, camera.data.lens = "Product camera", 52
aim(camera, (0, 0, 0.6))
scene.camera = camera
scene.render.engine = "CYCLES"
scene.cycles.samples = 40
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1600, 1000, 100
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "AgX"
scene.render.filepath = str(OUTPUT / "gpu-assembled.png")

# Open into a useful camera-framed material view; keep the individual components selectable.
bpy.ops.object.select_all(action="DESELECT")
shroud.select_set(True)
bpy.context.view_layer.objects.active = shroud
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            area.spaces.active.region_3d.view_perspective = "CAMERA"
            area.spaces.active.shading.type = "MATERIAL"
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT / "gpu-module.blend"))

glb = (OUTPUT / "gpu-module.glb").read_bytes()
length = struct.unpack_from("<I", glb, 12)[0]
gltf = json.loads(glb[20:20 + length])
report = {"blender": bpy.app.version_string, "bytes": len(glb), "objects": len(asset_objects),
          "meshes": len(gltf.get("meshes", [])), "materials": len(gltf.get("materials", [])),
          "animations": [item["name"] for item in gltf.get("animations", [])]}
(OUTPUT / "manifest.json").write_text(json.dumps(report, indent=2))
print("GPU_MODEL_RESULT", json.dumps(report))
if len(glb) > 10 * 1024 * 1024:
    raise RuntimeError("GLB exceeds the media library 10 MB limit")
bpy.ops.render.render(write_still=True)
scene.frame_set(136)
camera.location = (10, -13, 11)
aim(camera, (0, 0, 2.1))
scene.render.filepath = str(OUTPUT / "gpu-exploded.png")
bpy.ops.render.render(write_still=True)
print("GPU_MODEL_READY", OUTPUT)
