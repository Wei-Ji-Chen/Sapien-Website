import { Router } from 'express';
import { query } from '../db';
import { escape } from 'mysql';
import { authorize } from '../auth';
import { IncomingForm, File, Fields, Files } from 'formidable';
import { STORAGE } from '../config';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as unzipper from 'unzipper';
import * as rimraf from 'rimraf';
import * as express from 'express';
import * as crypto from 'crypto';
import * as path from 'path';
import { convertToGltf } from '../processing/convert';


interface JointData {
  axis: {
    origin: [number, number, number],
    direction: [number, number, number]
  },
  limit: {
    a: number,
    b: number,
    noLimit: boolean,
    rotates: boolean,
    noRotationLimit: boolean,
    rotationLimit: number
  }
}

interface PartTreeNodeSerialized {
  id: number;
  parent: number;
  children: number[];
  name: string;
}

interface MotionTreeNodeSerialized {
  id: number;
  parent: number;
  joint: string;
  name?: string;
  parts: { id: number, name: string }[];
  jointData: JointData;
}



function rmrf(path: string): Promise<void> {
  return new Promise((res, rej) => {
    rimraf(path, err => {
      if (err) {
        rej(err);
      } else {
        res();
      }
    })
  });
}


export const modelRouter = Router();

const rawModelDir = STORAGE + "/models/raw";
const partnetModelDir = STORAGE + "/models/partnet";

modelRouter.use(authorize(3)).use("/files/raw", express.static(rawModelDir));
modelRouter.use(authorize(3)).use("/files/partnet", express.static(partnetModelDir));

const modelFilenames = [
  ".obj", ".dae", ".glb", ".gltf", ".stl", ".ply", ".fbx"
]

modelRouter.get("/category", authorize(3), async (req, res) => {
  res.send(await query("SELECT * FROM ShapeCategory"));
});

modelRouter.post("/category", authorize(3), async (req, res) => {
  let { name } = req.body;
  if (!name) {
    res.status(403).send({ msg: "invalid name" });
  }
  try {
    await query(`INSERT INTO ShapeCategory (name) VALUES (${escape(name)})`);
    res.send({ msg: "success" });
  } catch (e) {
    res.status(500).end();
  }
});

// TODO: change authorize level!
modelRouter.post("/raw/upload", authorize(3), async (req, res) => {
  try {
    const form = new IncomingForm();

    const file = await new Promise<File>((res, rej) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          return rej(err);
        }
        const file = files["model"];
        if (!file || file instanceof Array) {
          return rej({ msg: "invalid file" })
        }
        res(file);
      });
    })

    // compute checksum
    const hash = crypto.createHash("sha256");
    const checksum = await new Promise((res, rej) => {
      fs.createReadStream(file.filepath)
        .on("data", chunk => hash.update(chunk))
        .on("error", err => rej({ msg: "failed to hash uploaded file" }))
        .on("end", () => res(hash.digest("base64")));
    })
    let q = `SELECT BIN_TO_UUID(modelId) as modelId from RawModel WHERE checksum = ${escape(checksum)}`;
    const rows = await query(q) as any[];
    if (rows.length !== 0) {
      // this model has already been uploaded
      let modelId = rows[0].modelId;
      q = `SELECT * from RawModelUser WHERE modelId = UUID_TO_BIN(${escape(modelId)}) and user = ${escape(req["user"].email)}`;
      let result = await query(q) as any[];
      if (result.length !== 0) {
        // this user uploaded it
        throw { msg: "You already already uploaded this model." }
      }
      // we only need to make this user an uploader
      q = `INSERT INTO RawModelUser (modelId, user, access) VALUES (UUID_TO_BIN(${escape(modelId)}), ${escape(req["user"].email)}, '5')`
      await query(q);
      return res.send({ modelId });
    }

    let count = 0;
    let modelFile = "";
    let size = 0;
    try {
      await fs.createReadStream(file.filepath)
        .pipe(unzipper.Parse())
        .on('entry', entry => {
          count += 1;
          const filename: string = entry.path;
          size += entry.vars.uncompressedSize;
          if (entry.type == "File" && modelFilenames.some(n => filename.toLowerCase().endsWith(n))) {
            if (modelFile.length !== 0) {
              throw { msg: "There are multiple model files." }
            }
            modelFile = filename;
          }
          if (count > 1000) {
            throw { msg: "There are more than 1000 files uploaded. This does not look right." }
          }
          if (size > 100 * 1024 * 1024) {
            throw { msg: "The model is larger than 100M. This does not look right." }
          }
          entry.autodrain();
        }).promise();
    } catch (e) {
      if (e?.msg) {
        throw e;
      }
      throw { msg: "Failed to parse .zip file. The uploaded file may be corrupted." }
    }

    if (!modelFile.length) {
      throw { msg: "Uploaded zip does not contain a model file" };
    }

    const uuid = uuidv4();
    const modelDir = rawModelDir + "/" + uuid;
    const pModelDir = partnetModelDir + "/" + uuid;
    const originalModelDir = modelDir + "/original";

    // run everything in sync to make sure no race
    if (fs.existsSync(modelDir) || fs.existsSync(pModelDir)) {
      throw { msg: "uuid collision! You should not see this message in your lifetime." }
    }
    fs.mkdirSync(modelDir, { recursive: true });
    fs.mkdirSync(pModelDir, { recursive: true });

    await fs.createReadStream(file.filepath).pipe(unzipper.Extract({ path: originalModelDir })).promise();
    await convertToGltf(originalModelDir + "/" + modelFile, modelDir + "/model.gltf")

    // make a copy at the partnet directory
    if (!fs.existsSync(`${modelDir}/model.gltf`)) {
      throw { msg: "The original model is corrupted." }
    }
    await fs.promises.copyFile(`${modelDir}/model.gltf`, `${pModelDir}/model.gltf`);
    if (fs.existsSync(`${modelDir}/model.bin`)) {
      await fs.promises.copyFile(`${modelDir}/model.bin`, `${pModelDir}/model.bin`);
    }
    if (fs.existsSync(`${modelDir}/textures`)) {
      await fs.promises.mkdir(`${pModelDir}/textures`);
      const files = await fs.promises.readdir(`${modelDir}/textures`);
      for (const f of files) {
        await fs.promises.copyFile(
          path.join(`${modelDir}/textures`, f),
          path.join(`${pModelDir}/textures`, f)
        );
      }
    }
    if (!fs.existsSync(`${pModelDir}/model.gltf`)) {
      throw { msg: "Failed to copy the model file." }
    }

    const user = req['user'];
    q = `INSERT INTO RawModel (modelId, checksum, modelFile) VALUES (UUID_TO_BIN(${escape(uuid)}), ${escape(checksum)}, ${escape(modelFile)})`;
    await query(q);

    q = `INSERT INTO RawModelUser (modelId, user, access) VALUES (UUID_TO_BIN(${escape(uuid)}), ${escape(user.email)}, '5')`;
    await query(q);

    q = `INSERT INTO PartNetModel (modelId, rawModelId) VALUES (UUID_TO_BIN(${escape(uuid)}), UUID_TO_BIN(${escape(uuid)}))`;
    await query(q);

    q = `INSERT INTO PartNetModelUserAccess (partNetModelId, user) VALUES (UUID_TO_BIN(${escape(uuid)}), ${escape(user.email)})`
    await query(q);
    // TODO finish backend

    return res.status(200).send({ modelId: uuid });
  } catch (err) {
    if (err && err.msg) {
      res.status(403).send({ msg: err.msg })
    }
    console.log(err);
    return res.status(500).end();
  }
})

modelRouter.get("/raw/get/count", authorize(3), async (req, res) => {
  try {
    const q = `SELECT COUNT(*) as count FROM RawModel`;
    res.send((await query(q))[0]);
  } catch (err) {
    console.log(err);
    res.status(500).end();
  }
})

modelRouter.get("/raw/get", authorize(3), async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 10;
    const offset = Number(req.query.offset) || 0;
    const q = `SELECT BIN_TO_UUID(modelId) as modelId, nfaces, modelFile from RawModel ORDER BY creationTime DESC LIMIT ${limit} OFFSET ${offset}`;
    res.send(await query(q));
  } catch (err) {
    console.log(err);
    res.status(500).end();
  }
})

function parseQuery(query: any) {
  const { category, shapeAnnotated, partAnnotated, mobilityAnnotated } = query;

  let where = [];

  if (shapeAnnotated === 'yes') {
    where.push("shapeAnnotated = '1'");
  } else if (shapeAnnotated === 'no') {
    where.push("shapeAnnotated = '0'");
  }

  if (partAnnotated === 'yes') {
    where.push("partAnnotated = '1'");
  } else if (partAnnotated === 'no') {
    where.push("partAnnotated = '0'");
  }

  if (mobilityAnnotated === 'yes') {
    where.push("mobilityAnnotated = '1'");
  } else if (mobilityAnnotated === 'no') {
    where.push("mobilityAnnotated = '0'");
  }

  if (category === 'none') {
    where.push("category = null");
  } else if (category && category != "all") {
    where.push(`category = ${escape(category)}`);
  }

  if (where.length) {
    return "WHERE " + where.join(" AND ");
  }
  return "";
}

modelRouter.get("/partnet/get/count", authorize(3), async (req, res) => {
  try {
    const where = parseQuery(req.query);
    const q = `SELECT COUNT(*) as count FROM PartNetModel ${where}`;
    res.send((await query(q))[0]);
  } catch (err) {
    console.log(err);
    res.status(500).end();
  }
})

modelRouter.get("/partnet/get", authorize(3), async (req, res) => {
  try {
    // if model id is provided, ignore all other parameters
    if (req.query.modelId) {
      const modelId = req.query.modelId;
      const q = `SELECT BIN_TO_UUID(modelId) as modelId, BIN_TO_UUID(rawModelId) as rawModelId, category, shapeAnnotated, partAnnotated, mobilityAnnotated, metadata, updateTime from PartNetModel where modelId = UUID_TO_BIN(${escape(modelId)})`;
      return res.send(await query(q));
    }

    const limit = Number(req.query.limit) || 10;
    const offset = Number(req.query.offset) || 0;
    const where = parseQuery(req.query);
    const q = `SELECT BIN_TO_UUID(modelId) as modelId, BIN_TO_UUID(rawModelId) as rawModelId, category, shapeAnnotated, partAnnotated, mobilityAnnotated, metadata, updateTime from PartNetModel ${where} ORDER BY updateTime DESC LIMIT ${limit} OFFSET ${offset}`;
    return res.send(await query(q));
  } catch (err) {
    console.log(err);
    res.status(500).end();
  }
})

/* The same function as in the front end */
function _verifyPartMobility(partnet: PartTreeNodeSerialized[], mobility: MotionTreeNodeSerialized[]) {
  // single root
  const roots = [] as PartTreeNodeSerialized[];
  partnet.forEach(p => {
    if (p.parent < 0) {
      roots.push(p);
    }
  })
  if (roots.length < 1) {
    throw { msg: "invalid partnet: no root part." }
  }
  if (roots.length > 1) {
    throw { msg: "invalid partnet: multiple root parts." }
  }
  const root = roots[0];

  // consistent parent child
  const id2part = new Map<number, PartTreeNodeSerialized>();
  partnet.forEach(p => id2part.set(p.id, p));
  partnet.forEach(p => {
    p.children.forEach(c => {
      if (!id2part.has(c)) {
        throw { msg: `invalid partnet: ${p.name}:${p.id}'s child ${c} does not exist` }
      }
      if (id2part.get(c).parent != p.id) {
        throw { msg: `invalid partnet: inconsistent parent-child relation for ${p.name}:${p.id}, ${c}` }
      }
    })
  });

  // no loop
  {
    const visited = new Set<number>();
    const q = [root];
    visited.add(root.id);
    while (q.length) {
      const r = q.pop();
      r.children.forEach(c => {
        if (visited.has(c)) {
          throw { msg: `invalid partnet: cycle detected at part ${c}` }
        }
        const child = id2part.get(c);
        visited.add(c);
        q.push(child);
      })
    }
    if (visited.size !== partnet.length) {
      throw { msg: "invalid partnet: invalid tree structure" }
    }
  }

  // mobility single root
  const mRoots = [] as MotionTreeNodeSerialized[];
  mobility.forEach(m => {
    if (m.parent < 0) {
      mRoots.push(m);
    }
  })
  if (mRoots.length < 1) {
    throw { msg: "invalid mobility: no root" }
  }
  if (mRoots.length > 1) {
    throw { msg: "invalid mobility: multiple roots" }
  }
  const mRoot = mRoots[0];

  const id2mobility = new Map<number, MotionTreeNodeSerialized>();
  mobility.forEach(m => {
    id2mobility.set(m.id, m);
  })

  // parent exists
  mobility.forEach(m => {
    if (m.parent >= 0) {
      if (!id2mobility.has(m.parent)) {
        throw { msg: `invalid mobility: invalid parent on ${m.id}` }
      }
    }
  })

  // no loop
  const mobilityId2Children = new Map<number, number[]>();
  mobility.forEach(m => {
    mobilityId2Children.set(m.id, []);
  })
  mobility.forEach(m => {
    if (m.parent >= 0) {
      mobilityId2Children.get(m.parent).push(m.id);
    }
  })
  {
    const visited = new Set<number>();
    visited.add(mRoot.id);
    const q = [mRoot.id];
    while (q.length) {
      const r = q.pop();
      mobilityId2Children.get(r).forEach(c => {
        if (visited.has(c)) {
          throw { msg: `invalid mobility: cycle detected at mobility ${c}` }
        }
        visited.add(c);
        q.push(c);
      })
    }
    if (visited.size !== mobility.length) {
      throw { msg: "invalid mobility: invalid tree structure" }
    }
  }

  // all joints are defined
  mobility.forEach(m => {
    if (m.joint == null) {
      throw { msg: "invalid mobility: some joints are not annotated" };
    }
  })

  // root must not move
  if (mRoot.joint === "hinge" || mRoot.joint === "slider") {
    throw { msg: "root must not move" };
  }

  // slider and hinge must have proper direction
  mobility.forEach(m => {
    if (m.joint === "hinge" || m.joint === "slider") {
      const [x, y, z] = m.jointData.axis.direction;
      if (x * x + y * y + z * z < 1e-6) {
        throw { msg: `invalid mobility: invalid axis direction at mobility ${m.name}:${m.id}` };
      }
    }
  })

  // parts are leaves
  mobility.forEach(m => {
    m.parts.forEach(p => {
      if (!id2part.has(p.id)) {
        throw { msg: `invalid mobility: part ${p.id} does not exist` };
      }
      if (id2part.get(p.id).children.length > 0) {
        throw { msg: `invalid mobility: part ${p.id} is not a leaf` };
      }
    })
  })
}


modelRouter.post("/partnet/save", authorize(3), async (req, res) => {
  try {
    const form = new IncomingForm();
    const [fields, files] = await new Promise<[Fields, Files]>((res, rej) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          return rej(err);
        }
        res([fields, files]);
      });
    })
    const modelId = fields["id"].toString();
    const modelDir = path.join(partnetModelDir, modelId);
    // TODO: validate the user is authorized to save this file!

    if (!modelId || !fs.existsSync(modelDir)) {
      throw { msg: "invalid model id" };
    }

    const gltf = JSON.parse(fields["model.gltf"].toString())
    if (gltf.images) {
      // TODO: make sure image exists
    }

    let partnet = []
    let mobility = []

    let shapeAnnotated = 0;
    let partAnnotated = 0;
    let mobilityAnnotated = 0;
    let category = null as string;
    if (fields["shapeAnnotated"] === "true") {
      shapeAnnotated = 1;
    }
    if (fields["partAnnotated"] === "true") {
      partAnnotated = 1;
    }
    if (fields["mobilityAnnotated"] === "true") {
      mobilityAnnotated = 1;
    }
    if (fields["category"]
      && !(fields["category"] instanceof Array)
      && !["", "null", "none"].includes(fields["category"])
    ) {
      category = fields["category"];
    }
    console.log(shapeAnnotated, partAnnotated, mobilityAnnotated, category)

    if (fields["partnet"] && !(fields["partnet"] instanceof Array)) {
      partnet = JSON.parse(fields["partnet"]);
    }
    if (fields["mobility"] && !(fields["mobility"] instanceof Array)) {
      mobility = JSON.parse(fields["mobility"]);
    }

    // validate shapenet
    if (shapeAnnotated && !category) {
      return res.status(403).send({ msg: "category is not annotated." })
    }

    // validate partnet and mobility
    if (shapeAnnotated && partAnnotated && mobilityAnnotated) {
      try {
        _verifyPartMobility(partnet, mobility);
      } catch (e) {
        if (e.msg) {
          return res.status(403).send(e)
        }
        return res.status(403).send({ msg: "invalid partnet or mobility: wrong format" })
      }
    }

    // verify category exists
    if ((await query<any[]>(`SELECT * FROM ShapeCategory WHERE name = ${escape(category)}`)).length === 0) {
      return res.status(403).send({ msg: "invalid category" });
    }
    // verify model exists
    if ((await query<any[]>(`SELECT modelId FROM PartNetModel WHERE modelId = UUID_TO_BIN(${escape(modelId)})`)).length === 0) {
      return res.status(403).send({ msg: "invalid model id" });
    }

    if (files["model.bin"]) {
      if (files["model.bin"] instanceof Array) {
        throw { msg: "invalid model.bin" }
      }
      await fs.promises.copyFile(files["model.bin"].filepath, path.join(modelDir, "model.bin"));
    }
    await fs.promises.writeFile(path.join(modelDir, "model.gltf"), JSON.stringify(gltf, null, 4))
    await fs.promises.writeFile(
      path.join(modelDir, "mobility_v3.json"),
      JSON.stringify({ partnet, mobility }, null, 4))

    await query(`UPDATE PartNetModel SET category = ${escape(category)}, shapeAnnotated = ${escape(shapeAnnotated)}, partAnnotated = ${escape(partAnnotated)}, mobilityAnnotated = ${escape(mobilityAnnotated)}, annotator = ${escape(req["user"].email)} WHERE modelId = UUID_TO_BIN(${escape(modelId)})`)

    // update access time
    await query(`UPDATE PartNetModelUserAccess SET partNetModelId = partNetModelId WHERE partNetModelId = UUID_TO_BIN(${escape(modelId)}) AND user = ${escape(req["user"].email)}`);

    return res.end();
  } catch (e) {
    console.log(e)
    return res.sendStatus(500);
  }
});
