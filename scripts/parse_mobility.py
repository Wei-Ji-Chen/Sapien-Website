import json
import os
import xml.etree.ElementTree as ET
from collections import defaultdict
import numpy as np
import xml.dom.minidom


def mobility_v3_to_urdf(mobility_json):
    # data_dir = "./40147"
    # with open(mobility_file) as f:
    #     data = json.load(f)
    data = mobility_json

    partnet = data["partnet"]
    mobility = data["mobility"]

    id2name = {}
    for p in partnet:
        id2name[p["id"]] = str(p["id"]) + "-" + p["name"]

    id2link = {}
    for link in mobility:
        id2link[link["id"]] = link

    roots = []
    id2children = defaultdict(list)
    for link in mobility:
        if link["parent"] == -1:
            roots.append(link["id"])
        else:
            id2children[link["parent"]].append(link["id"])

    assert len(roots) == 1, "there must only be 1 root"
    root = roots[0]

    # BFS verify
    visited = set()
    q = [root]
    visited.add(root)
    while q:
        node = q.pop()
        for c in id2children[node]:
            assert c not in visited, "mobility tree is invalid: has a loop"
            q.append(c)
            visited.add(c)

    for id in id2link:
        if id == root:
            assert id2link[id]["joint"] not in ["hinge", "slider"]
        else:
            assert id2link[id]["joint"] in ["hinge", "slider"]

    robot_name = os.path.basename(data_dir)
    root = ET.Element("robot", {"name": robot_name})

    dombase = ET.SubElement(root, "link", {"name": "base"})
    id2domlink = {}
    id2domjoint = {}
    id2origin = {}
    for id in id2link:
        domlink = ET.SubElement(root, "link", {"name": f"link_{id}"})
        id2domlink[id] = domlink

    for id in id2link:
        data = id2link[id]
        if data["joint"] == "hinge":
            origin = np.array(data["jointData"]["axis"]["origin"])
        elif data["joint"] == "slider":
            origin = np.array(data["jointData"]["axis"]["origin"])
        else:
            origin = np.zeros(3)
        id2origin[id] = origin

    for id in id2link:
        domjoint = ET.SubElement(root, "joint", {"name": f"joint_{id}"})
        id2domjoint[id] = domjoint

        data = id2link[id]
        origin = id2origin[id]
        parent = id2link[id]["parent"]
        if parent == -1:
            parent_origin = np.zeros(3)
        else:
            parent_origin = id2origin[parent]

        visual_offset = -origin
        joint_offset = origin - parent_origin

        domlink = id2domlink[id]
        for p in data["parts"]:
            name = p["name"]
            part_id = p["id"]
            filename = "gltf/" + id2name[part_id] + ".gltf"
            visual = ET.SubElement(domlink, "visual", {"name": f"{name}-{part_id}"})
            collision = ET.SubElement(domlink, "collision")
            ET.SubElement(
                visual, "origin", {"xyz": " ".join([str(x) for x in visual_offset])}
            )
            ET.SubElement(
                collision, "origin", {"xyz": " ".join([str(x) for x in visual_offset])}
            )
            geom = ET.SubElement(visual, "geometry")
            ET.SubElement(geom, "mesh", {"filename": filename})
            geom = ET.SubElement(collision, "geometry")
            ET.SubElement(geom, "mesh", {"filename": filename})

        if data["joint"] == "hinge":
            origin = np.array(data["jointData"]["axis"]["origin"])
        elif data["joint"] == "slider":
            origin = np.array(data["jointData"]["axis"]["origin"])

        if data["joint"] == "hinge":
            direction = np.array(data["jointData"]["axis"]["direction"])
            no_limit = data["jointData"]["limit"]["noLimit"]
            if no_limit:
                domjoint.attrib["type"] = "continuous"
            else:
                domjoint.attrib["type"] = "revolute"
                limit1 = data["jointData"]["limit"]["a"]
                limit2 = data["jointData"]["limit"]["b"]
                if limit1 > limit2:
                    limit1 = -limit1
                    limit2 = -limit2
                    direction = -direction
                ET.SubElement(
                    domjoint,
                    "limit",
                    {
                        "lower": str(limit1 * np.pi / 180),
                        "upper": str(limit2 * np.pi / 180),
                    },
                )

            ET.SubElement(
                domjoint, "origin", {"xyz": " ".join([str(x) for x in joint_offset])}
            )
            ET.SubElement(
                domjoint,
                "axis",
                {
                    "xyz": " ".join(
                        [str(x) for x in direction / np.linalg.norm(direction)]
                    )
                },
            )
            assert parent != -1
            ET.SubElement(domjoint, "parent", {"link": f"link_{parent}"})
            ET.SubElement(domjoint, "child", {"link": f"link_{id}"})

        elif data["joint"] == "slider":
            direction = np.array(data["jointData"]["axis"]["direction"])
            no_limit = data["jointData"]["limit"]["noLimit"]
            assert not no_limit, "slider must have limit"

            domjoint.attrib["type"] = "prismatic"
            limit1 = data["jointData"]["limit"]["a"]
            limit2 = data["jointData"]["limit"]["b"]
            if limit1 > limit2:
                limit1 = -limit1
                limit2 = -limit2
                direction = -direction
            ET.SubElement(
                domjoint, "limit", {"lower": str(limit1), "upper": str(limit2)}
            )
            ET.SubElement(
                domjoint, "origin", {"xyz": " ".join([str(x) for x in joint_offset])}
            )
            axis_xyz = " ".join([str(x) for x in direction / np.linalg.norm(direction)])
            ET.SubElement(
                domjoint, "axis", {"xyz": axis_xyz},
            )
            assert parent != -1
            domparent = ET.SubElement(domjoint, "parent", {"link": f"link_{parent}"})
            domchild = ET.SubElement(domjoint, "child", {"link": f"link_{id}"})

            if data["rotates"]:
                # NOTE: we do not handle screw
                ET.SubElement(root, "link", {"name": f"link_{id}_connector"})
                domchild = domchild.attrib["link"] = f"link_{id}_connector"
                domjoint2 = ET.SubElement(
                    root,
                    "joint",
                    {"name": f"joint_{id}_connector", "type": "continuous"},
                )
                ET.SubElement(domjoint2, "origin", {"xyz": "0 0 0"})
                ET.SubElement(domjoint2, "axis", {"xyz": axis_xyz})
                ET.SubElement(domjoint2, "parent", {"link": f"link_{id}_connector"})
                ET.SubElement(domjoint2, "child", {"link": f"link_{id}"})
                # TODO: test it

        else:
            domjoint.attrib["type"] = "fixed"
            ET.SubElement(
                domjoint,
                "origin",
                {"rpy": "1.570796326794897 0 -1.570796326794897", "xyz": "0 0 0"},
            )
            assert parent == -1
            ET.SubElement(domjoint, "parent", {"link": "base"})
            ET.SubElement(domjoint, "child", {"link": f"link_{id}"})

    output = xml.dom.minidom.parseString(ET.tostring(root).decode()).toprettyxml(
        indent="  "
    )
    return output

    # with open(os.path.join(data_dir, "mobility_v3.urdf"), "w") as f:
    #     f.write(output)
