import { spawn } from 'child_process';
import * as fs from 'fs';

function shell(cmd: string, args: string[]) {
  return new Promise<void>((res, rej) => {
    const c = spawn(cmd, args);
    c.stderr.on('data', d=>{
      console.log(d.toString());
    })
    c.on('close', (code) => {
      if (code !== 0) {
        return rej();
      }
      res();
    })
  })
}

// preferred dae processing method
export async function convertDaeToGltf(input: string, output: string) {
  console.log("trying to convert dae to gltf with assimp")
  try {
    await shell("assimp", ["export", input, output, "-f", "gltf2"])
  } catch (e) {
    throw { msg: "Assimp failed to convert dae to gltf. The dae may be corrupted." };
  }
  if (!fs.existsSync(output)) {
    throw { msg: "Assimp failed to produce output gltf." }
  }
}

// fallback dae processing method
// export async function convertDaeToObj(input: string, output: string) {
//   try {
//     await shell("python3", ["-c", `import pymeshlab; ms = pymeshlab.MeshSet(); ms.load_new_mesh("${input}"); ms.save_current_mesh("${output}")`])
//   } catch (e) {
//     throw { msg: "Meshlab failed to convert dae to obj. The dae may be corrupted." };
//   }
//   if (!fs.existsSync(output)) {
//     throw { msg: "Meshlab failed to produce output obj." }
//   }
// }

export async function convertToGltf(input: string, output: string, format?: string) {
  // try assimp and meshlab before blender
  if (input.toLocaleLowerCase().endsWith(".dae")) {
    let outFile = ""
    // prefer convert to gltf
    try {
      await convertDaeToGltf(input, input + ".gltf");
      outFile = input + ".gltf";
    } catch (e) {
      console.log(e);
    }

    // fallback to convert to obj
    // if (outFile === "") {
    //   try {
    //     await convertDaeToObj(input, input + ".obj");
    //     outFile = input + ".obj";
    //   } catch (e) {}
    // }

    if (outFile !== "") {
      input = outFile
    }
  }
  try {
    if (format) {
      await shell("blender", ["--background", "--python", "convert_gltf.py", "--", input, output, format])
    } else {
      await shell("blender", ["--background", "--python", "convert_gltf.py", "--", input, output])
    }
  } catch (e) {
    throw { msg: "blender failed to convert model." }
  }
}
