import { Router } from 'express';
import { query } from '../db';
import { escape } from 'mysql';
import { authorizeByQuery, authorize, authenticate } from '../auth';
import { STORAGE } from '../config';
import { IncomingForm, Files } from 'formidable';
import * as fs from 'fs';
import * as unzipper from 'unzipper';
import * as rimraf from 'rimraf';
import { modelRouter } from './model';

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

export const apiRouter = Router();
apiRouter.use("/annotation", modelRouter);

apiRouter.get('/', async (req, res) => {
  res.send("sapien api");
});

apiRouter.get('/categories', async (req, res) => {
  const result = await query("select modelCat as cat, COUNT(*) as count from PartNetMobilityModel group by modelCat order by modelCat;");
  res.send(result);
});

function parseQuery(req) {
  const cat = String(req.query.category) || "Box";
  const limit = Number(req.query.limit) || 10;
  const offset = Number(req.query.offset) || 0;
  return `select annoId as id, modelId as model, modelCat as cat, original, partnetVersion as version from PartNetMobilityModel where modelCat = ${escape(cat)} limit ${escape(limit)} offset ${offset}`;
}
apiRouter.get('/models', async (req, res) => {
  const result = await query(parseQuery(req));
  res.send(result);
});

apiRouter.get('/models/count', async (req, res) => {
  const cat = req.query.category;
  let q = "";
  if (cat) {
    q = `select COUNT(*) as count from PartNetMobilityModel where modelCat = ${escape(cat)}`;
  } else {
    q = `select COUNT(*) as count from PartNetMobilityModel`;
  }
  const result = await query(q);
  res.send(result[0]);
});

apiRouter.get('/download/:file', authorizeByQuery(1), (req, res) => {
  const { file } = req.params;
  console.log('download', file, 'from', req.headers['x-real-ip'] as string);
  res.download(`${STORAGE}/${file}`);
})

apiRouter.get('/download/compressed/:file', authorizeByQuery(1), (req, res) => {
  const { file } = req.params;
  console.log('download', file, 'from', req.headers['x-real-ip'] as string);
  res.download(`${STORAGE}/compressed/${file}`);
})

apiRouter.get('/download/compressed/:version/:file', authorizeByQuery(1), (req, res) => {
  const { version, file } = req.params;
  console.log('download', file, 'from', req.headers['x-real-ip'] as string);
  res.download(`${STORAGE}/compressed/${version}/${file}`);
})

apiRouter.get('/wheel/:file', (req, res) => {
  const { file } = req.params;
  console.log('download wheel', file, 'from', req.headers['x-real-ip'] as string);
  res.download(`${STORAGE}/wheel/${file}`);
});

apiRouter.get("/docs", async (req, res) => {
  const docsDir = STORAGE + '/docs';
  try {
    if (fs.existsSync(docsDir)) {
      res.send(
        { versions: fs.readdirSync(docsDir) }
      )
    } else {
      res.send(
        { versions: [] }
      )
    }
  } catch (err) {
    res.sendStatus(500);
  }
});

apiRouter.post('/delete-docs', authorize(5), async (req, res) => {
  const { version } = req.body;
  if (version && fs.existsSync(`${STORAGE}/docs/${version}`)) {
    await rmrf(`${STORAGE}/docs/${version}`);
  }
  res.end();
});

apiRouter.post('/upload-docs', authorize(5), async (req, res) => {
  const form = new IncomingForm();

  try {
    const [file, version] = await new Promise((res, rej) => {
      form.parse(req, (err, fields, files: Files) => {
        if (err) {
          return rej('Error');
        }
        if (!files['docs']) {
          return rej('Incorrect number of files');
        }
        if (!fields['version']) {
          return rej('No version provided');
        }
        const version = String(fields['version']);
        if (!version.match(/^[a-zA-Z0-9]+[a-zA-Z0-9\.]*$/)) {
          return rej('Invalid version string');
        }
        res([files['docs'], version])
      });
    })

    try {
      const docsDir = STORAGE + '/docs';
      const tempDir = STORAGE + '/docs-temp';
      try {
        await rmrf(tempDir);
      } catch (err) { }
      fs.mkdirSync(docsDir, { recursive: true });
      await fs.createReadStream(file.filepath).pipe(unzipper.Extract({ path: STORAGE + '/docs-temp' })).promise();
      const content = await fs.promises.readdir(tempDir);
      if (content.includes('index.html')) {
        try {
          await rmrf(`${docsDir}/${version}`);
        } catch (err) { }
        await fs.promises.rename(tempDir, `${docsDir}/${version}`);
        return res.end();
      }
      if (content.length === 1) {
        const dir = tempDir + '/' + content[0];
        if (!(await fs.promises.stat(dir)).isDirectory()) {
          throw "Unable to find index.html";
        }
        const innerContent = await fs.promises.readdir(dir);
        if (innerContent.includes('index.html')) {
          try {
            await rmrf(`${docsDir}/${version}`);
          } catch (err) { }
          await fs.promises.rename(dir, `${docsDir}/${version}`);
          await rmrf(tempDir);
          return res.end();
        }
        throw "Unable to find index.html";
      }
    } catch (err) {
      console.log(err);
      if (typeof err === 'string') {
        throw err;
      }
      throw "Unable to extract zip";
    }
  } catch (err) {
    res.status(403).send({ msg: err });
  }
})
