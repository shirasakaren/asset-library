#!/usr/bin/env python3
"""
mesh_probe.py — emit a single JSON object describing a 3D file (FBX / OBJ /
GLTF / GLB). Backs the analyzer's MeshMeta extractor.

Usage: mesh_probe.py <path-to-file>

The script is intentionally side-effect-free and prints exactly one JSON
object on stdout. Non-zero exit + stderr message on any failure.
"""
import json
import sys
from typing import Any, Dict, List


def _bbox_from_vertices(vertices) -> Dict[str, Any]:
    if vertices is None or len(vertices) == 0:
        return {"min": [0, 0, 0], "max": [0, 0, 0]}
    xs = [v[0] for v in vertices]
    ys = [v[1] for v in vertices]
    zs = [v[2] for v in vertices]
    return {"min": [min(xs), min(ys), min(zs)], "max": [max(xs), max(ys), max(zs)]}


def _walk_textures(material) -> List[str]:
    refs: List[str] = []
    try:
        props = material.properties
    except AttributeError:
        return refs
    for prop in props:
        if "tex" in (prop.key or "").lower():
            try:
                refs.append(prop.data.decode("utf-8") if isinstance(prop.data, bytes) else str(prop.data))
            except Exception:
                pass
    return refs


def probe(path: str) -> Dict[str, Any]:
    try:
        import pyassimp  # type: ignore
    except ImportError:
        raise RuntimeError("pyassimp is not installed in the analyzer venv")

    with pyassimp.load(path) as scene:
        triangles = 0
        quads = 0
        vertices_total = 0
        all_vertices = []
        texture_refs: List[str] = []
        for mesh in scene.meshes:
            vertices_total += len(mesh.vertices)
            all_vertices.extend(mesh.vertices.tolist() if hasattr(mesh.vertices, "tolist") else list(mesh.vertices))
            for face in mesh.faces:
                if len(face) == 3:
                    triangles += 1
                elif len(face) == 4:
                    quads += 1
        for material in scene.materials:
            texture_refs.extend(_walk_textures(material))

        animations = []
        has_skeleton = False
        for anim in scene.animations:
            try:
                # FPS may be 0 in some FBX exports; fall back to 30.
                ticks_per_sec = anim.ticks_per_second if anim.ticks_per_second and anim.ticks_per_second > 0 else 30
                length_sec = float(anim.duration) / float(ticks_per_sec)
            except Exception:
                length_sec = 0.0
            has_root_motion = False
            try:
                if anim.channels:
                    first = anim.channels[0]
                    if first.position_keys and len(first.position_keys) > 1:
                        first_p = first.position_keys[0].value
                        last_p = first.position_keys[-1].value
                        if any(abs(a - b) > 1e-3 for a, b in zip(first_p, last_p)):
                            has_root_motion = True
            except Exception:
                pass
            animations.append(
                {
                    "name": str(anim.name) if anim.name else "",
                    "lengthSec": round(length_sec, 4),
                    "hasRootMotion": has_root_motion,
                }
            )
        for mesh in scene.meshes:
            if getattr(mesh, "bones", None):
                has_skeleton = True
                break

        return {
            "triangles": triangles,
            "quads": quads,
            "vertices": vertices_total,
            "materials": len(scene.materials),
            "hasSkeleton": has_skeleton,
            "animations": animations,
            "boundingBox": _bbox_from_vertices(all_vertices),
            "textureRefs": list(dict.fromkeys(texture_refs)),
        }


def main(argv: List[str]) -> int:
    if len(argv) != 2:
        print("usage: mesh_probe.py <path>", file=sys.stderr)
        return 2
    try:
        result = probe(argv[1])
    except Exception as err:  # noqa: BLE001 — surface every failure as stderr
        print(f"mesh_probe failed: {err}", file=sys.stderr)
        return 1
    print(json.dumps(result, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
