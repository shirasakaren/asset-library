"""
render_glb_preview.py — neutral-lit preview render of a GLB.

Usage:
    blender -b -P render_glb_preview.py -- <input.glb> <output.png> [<hdri_path>]

The camera frames the bounding box of every imported mesh; we use Eevee for
speed (Cycles is overkill for a thumbnail). HDRI lighting is optional but
recommended — pass the path to studio_small_03.hdr (or similar) as the third
positional argument.
"""
import math
import os
import sys
from mathutils import Vector  # type: ignore

import bpy  # type: ignore


def _argv_after_dash() -> list[str]:
    if "--" in sys.argv:
        return sys.argv[sys.argv.index("--") + 1 :]
    return []


def _scene_bbox() -> tuple[Vector, Vector]:
    min_v = Vector((float("inf"), float("inf"), float("inf")))
    max_v = Vector((float("-inf"), float("-inf"), float("-inf")))
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for i in range(3):
                if world[i] < min_v[i]:
                    min_v[i] = world[i]
                if world[i] > max_v[i]:
                    max_v[i] = world[i]
    if math.isinf(min_v.x):
        return Vector((-1, -1, -1)), Vector((1, 1, 1))
    return min_v, max_v


def setup_hdri(path: str) -> None:
    world = bpy.context.scene.world or bpy.data.worlds.new("MGM_World")
    bpy.context.scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    bg = nt.nodes.new("ShaderNodeBackground")
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    out = nt.nodes.new("ShaderNodeOutputWorld")
    env.image = bpy.data.images.load(path)
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])


def setup_camera(min_v: Vector, max_v: Vector) -> None:
    center = (min_v + max_v) / 2
    size = (max_v - min_v).length
    distance = max(size * 1.8, 1.5)
    cam_data = bpy.data.cameras.new("MGM_Cam")
    cam_obj = bpy.data.objects.new("MGM_Cam", cam_data)
    bpy.context.scene.collection.objects.link(cam_obj)
    # 30° azimuth, 15° elevation off the +X axis.
    az = math.radians(30)
    el = math.radians(15)
    cam_obj.location = center + Vector((
        math.cos(el) * math.cos(az) * distance,
        math.cos(el) * math.sin(az) * distance,
        math.sin(el) * distance,
