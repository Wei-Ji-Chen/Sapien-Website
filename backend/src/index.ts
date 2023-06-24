import * as express from 'express';
import * as cors from 'cors';
import * as cookieParser from 'cookie-parser';
import * as bodyParser from 'body-parser';
import { PORT } from './config';
import { apiRouter } from './routers/api';
import { userRouter } from './routers/user';
import { STORAGE } from './config';

import { createToken } from './auth';
import * as db from './db';

const app = express();
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());  // this gives req.body
app.use(cookieParser())

app.use('/api/data/dataset', express.static(STORAGE + '/dataset'))
app.use('/api/data/images', express.static(STORAGE + '/images'))
app.use('/api', apiRouter);
app.use('/user', userRouter);
app.use('/docs', express.static(STORAGE + '/docs'));

app.get('*', (req, res) => {
  res.sendStatus(404);
});

if (process.env.MODE == "development") {
  let query = `SELECT version, privilege FROM UserEntry WHERE email = "admin@test.edu"`
  db.query(query).then(user => {
    createToken("admin@test.edu", user[0].version).then(x => {
      console.log('admin', `?token=${x}`);
    });
  }).catch(() => {
    createToken("admin@test.edu", 0).then(x => {
      console.log('admin', `?token=${x}`);
    });
  })

  query = `SELECT version, privilege FROM UserEntry WHERE email = "user@test.edu"`
  db.query(query).then(user => {
    createToken("user@test.edu", user[0].version).then(x => {
      console.log('user', `?token=${x}`);
    });
  }).catch(() => {
    createToken("user@test.edu", 0).then(x => {
      console.log('user', `?token=${x}`);
    });
  })
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
