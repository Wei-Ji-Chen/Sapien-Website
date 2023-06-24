import sys

try:
    import os
    import bpy
    import json

    argv = sys.argv
    try:
        index = argv.index("--") + 1
    except ValueError:
        index = len(argv)
    argv = argv[index:]

    if len(argv) != 1:
        print("usage: blender --background --python mobility_v2_to_v3.py -- data_dir")
        sys.exit(1)

    def clear_scene():
        if len(bpy.context.scene.objects.items()) == 0:
            return
        bpy.ops.object.mode_set(mode="OBJECT")
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete()

    def import_obj(path):
        print('importing', path)
        old_objs = set(bpy.context.scene.objects)
        bpy.ops.import_scene.obj(filepath=path)
        return set(bpy.context.scene.objects) - old_objs

    clear_scene()

    # parse partnet and mobility
    data_dir = argv[0]
    with open(data_dir + "/result.json") as f:
        partnet = json.load(f)
    with open(data_dir + "/mobility_v2.json") as f:
        mobility = json.load(f)

    # clean up mobility
    def clean_json(node):
        if isinstance(node, list):
            for i in range(len(node)):
                if node[i] is None:
                    node[i] = 0
            for n in node:
                clean_json(n)
        if isinstance(node, dict):
            for key in node:
                clean_json(node[key])

    clean_json(mobility)

    pid_obj = {}
    obj_pid = {}

    new_partnet = []

    def parse_partnet(parts, parent=-1):
        for p in parts:
            item = {
                "parent": parent,
                "children": [],
                "id": p["id"],
                "objs": [],
                "name": p["name"],
            }
            if "objs" in p:
                pid_obj[p["id"]] = p["objs"]
                item["objs"] = p["objs"]
            if "children" in p:
                parse_partnet(p["children"], p["id"])
                item["children"] = [c["id"] for c in p["children"]]
            new_partnet.append(item)

    parse_partnet(partnet)

    for pid, objs in pid_obj.items():
        for obj in objs:
            obj_pid[obj] = pid

    obj_dir = os.path.join(data_dir, "textured_objs")
    file_list = sorted(os.listdir(obj_dir))
    obj_list = [item for item in file_list if item.endswith(".obj")]

    for item in obj_list:
        path = os.path.join(obj_dir, item)
        partnet_id = obj_pid[item[:-4]]
        for i, obj in enumerate(import_obj(path)):
            obj["partnet_id"] = partnet_id
            obj.name = f"{partnet_id}_{i}"

    bpy.context.scene["partnet"] = new_partnet
    bpy.context.scene["mobility"] = mobility

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.transform_apply(
        location=True, rotation=True, scale=True, properties=True
    )

    bpy.ops.export_scene.gltf(
        filepath=data_dir + "/model.gltf",
        check_existing=False,
        export_format="GLTF_SEPARATE",
        export_texture_dir="textures",
        export_keep_originals=False,
        export_extras=True,
    )
    with open(data_dir + "/mobility_v3.json", "w") as f:
        json.dump({"partnet": new_partnet, "mobility": mobility}, f)

except Exception as e:
    print(e)
    sys.exit(1)
