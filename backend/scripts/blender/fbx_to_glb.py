"""
fbx_to_glb.py — import an FBX/OBJ/BLEND in headless Blender and export GLB.

Usage (called from Node):
    blender -b -P fbx_to_glb.py -- <input> <output.glb>

The script is format-aware (extension on `input` decides which Blender
importer to use). Animations are kept (Blender's glTF 2.0 exporter does so
by default). Stdout is silenced — we only care about exit codes.
"""
import os
import sys

import bpy  # type: ignore


def _argv_after_dash() -> list[str]:
    if "--" in sys.argv:
        return sys.argv[sys.argv.index("--") + 1 :]
    return []


def import_source(path: str) -> None:
    ext = os.path.splitext(path)[1].lower()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == ".obj":
        # Newer Blender uses bpy.ops.wm.obj_import; fall back if missing.
        if hasattr(bpy.ops.wm, "obj_import"):
            bpy.ops.wm.obj_import(filepath=path)
        else:
            bpy.ops.import_scene.obj(filepath=path)
    elif ext == ".blend":
        bpy.ops.wm.open_mainfile(filepath=path)
    elif ext in (".gltf", ".glb"):
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        raise RuntimeError(f"Unsupported source extension: {ext}")


def export_glb(out_path: str) -> None:
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        export_apply=True,
        export_animations=True,
        export_skins=True,
        export_morph=True,
        export_lights=False,
    )


def main() -> int:
    args = _argv_after_dash()
    if len(args) != 2:
        print("fbx_to_glb: expected <input> <output.glb>", file=sys.stderr)
        return 2
    src, dst = args
    try:
        import_source(src)
        export_glb(dst)
    except Exception as err:  # noqa: BLE001
        print(f"fbx_to_glb failed: {err}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
