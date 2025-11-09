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
