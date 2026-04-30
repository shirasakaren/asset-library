"""
blend_probe.py — load a .blend in headless Blender, emit MeshMeta JSON.

Usage (called from Node via `blender -b -P blend_probe.py -- <path>`):
    blender -b -P blend_probe.py -- /tmp/mgm-analyze/<job>/file.blend
"""
import json
import sys

import bpy  # type: ignore


def _argv_after_dash() -> list[str]:
    if "--" in sys.argv:
        return sys.argv[sys.argv.index("--") + 1 :]
    return []


def probe(path: str) -> dict:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.open_mainfile(filepath=path)

    triangles = 0
    quads = 0
    vertices_total = 0
    materials = set()
    texture_refs: list[str] = []
    all_coords = []

    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        mesh = obj.data
        if not mesh.polygons:
            continue
        vertices_total += len(mesh.vertices)
        for v in mesh.vertices:
            all_coords.append((v.co.x, v.co.y, v.co.z))
        for p in mesh.polygons:
            n = len(p.vertices)
            if n == 3:
                triangles += 1
            elif n == 4:
                quads += 1
            else:
                # triangulate ngons for the count
                triangles += n - 2
        for slot in obj.material_slots:
            if slot.material:
                materials.add(slot.material.name)
                for node in (slot.material.node_tree.nodes if slot.material.node_tree else []):
                    if node.type == "TEX_IMAGE" and node.image:
                        texture_refs.append(node.image.name)

    if all_coords:
        xs = [c[0] for c in all_coords]
        ys = [c[1] for c in all_coords]
        zs = [c[2] for c in all_coords]
        bbox = {"min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)]}
    else:
        bbox = {"min": [0, 0, 0], "max": [0, 0, 0]}

    has_skeleton = any(obj.type == "ARMATURE" for obj in bpy.context.scene.objects)
    animations = []
    for action in bpy.data.actions:
        frame_start, frame_end = action.frame_range
        length_sec = (frame_end - frame_start) / max(bpy.context.scene.render.fps, 1)
        animations.append(
            {
                "name": action.name,
                "lengthSec": round(float(length_sec), 4),
                "hasRootMotion": False,
            }
        )

    return {
        "triangles": triangles,
        "quads": quads,
        "vertices": vertices_total,
        "materials": len(materials),
        "hasSkeleton": has_skeleton,
        "animations": animations,
        "boundingBox": bbox,
        "textureRefs": list(dict.fromkeys(texture_refs)),
    }


def main() -> int:
    args = _argv_after_dash()
    if len(args) != 1:
        print("blend_probe: expected exactly one positional arg", file=sys.stderr)
        return 2
    try:
        result = probe(args[0])
    except Exception as err:  # noqa: BLE001
        print(f"blend_probe failed: {err}", file=sys.stderr)
        return 1
    print(json.dumps(result, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
