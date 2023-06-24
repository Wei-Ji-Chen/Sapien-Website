import sys

try:
    import bpy

    argv = sys.argv
    try:
        index = argv.index("--") + 1
    except ValueError:
        index = len(argv)
    argv = argv[index:]

    if len(argv) not in [2, 3]:
        print(
            "usage: blender --background --python convert.py -- input output [format]"
        )
        sys.exit(1)

    input = argv[0]
    output = argv[1]
    if len(argv) == 3:
        format = argv[2]
    else:
        format = input.split(".")[-1].lower()

    def clear_scene():
        if len(bpy.context.scene.objects.items()) == 0:
            return
        bpy.ops.object.mode_set(mode="OBJECT")
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete()

    clear_scene()

    if format == "obj":
        bpy.ops.import_scene.obj(filepath=input)
    elif format == "fbx":
        bpy.ops.import_scene.fbx(filepath=input)
    elif format in ["gltf", "glb"]:
        bpy.ops.import_scene.gltf(filepath=input)
    elif format == "stl":
        bpy.ops.import_scene.stl(filepath=input)
    else:
        print("invalid input format")
        sys.exit(1)

    # unparent, delete empty object, apply transform
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.data.objects:
        if obj.data is None or len(obj.data.polygons) == 0:
            obj.select_set(True)
    bpy.ops.object.delete()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.transform_apply(
        location=True, rotation=True, scale=True, properties=True
    )

    bpy.ops.export_scene.gltf(
        filepath=output,
        check_existing=False,
        export_format="GLTF_SEPARATE",
        export_texture_dir="textures",
        export_keep_originals=False,
    )
except (Exception):
    # make sure blender gives an error code
    sys.exit(1)
