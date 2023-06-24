# PartNet Mobility v3 file format documentation
## Mobility
The root directory should contain the following files
- model.gltf (required)
- model.bin (optional, used by model.gltf)
- mobility_v3.json (reqruied)
- textures/ (optional, textures must be stored here)

`model.gltf` must satisfy the following conditions:
- uses glTF version 2
- contains 1 scene
- contains mesh nodes only
- does not contain nested nodes
- each node has the extra field `partnet_id` with type `int`
- the name of each node must start with its `partnet_id` followed by an `_`

`mobility_v2.json` must follow this schema
```typescript
{
  partnet: {
    id: int,  // correspond to model.gltf partnet_id
    parent: int,  // referto partnet id
    children: int[],
    name: string
  }[],
  mobility: {
    id: int,
    parent: int,  // refer to mobility id
    joint: "hinge" | "slider" | "fixed" | "free",  // screw should be annotated as slider
    parts: { id: int }[]  // refer to partnet id, must be leaf node
    jointData: {
      axis: { 
        origin: [number, number, number],
        direction: [number, number, number]
      },
      limit: {
        a: number,  // start pose, in degrees for hinge
        b: number,  // end pose, can be smaller than a
        noLimit: boolean,  // if true, a and b are ignored
        rotates: boolean,  // only used for slider to annotate screw joint
        noRotationLimit: boolean,  // only used for screw, if true, rotationLimit is ignored
        rotationLimit: number,  // screw rotation degrees from a to b
      }
    }
  }[]
}
```


## URDF
Once converted to URDF, the following files should be generated
- mobility_v3.urdf
- gltf/

The gltf directory should store the glTF models for each partnet part. They
should share texture files with `model.gltf`


