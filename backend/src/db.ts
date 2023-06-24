import * as mysql from 'mysql';
import * as server from './config';

const pool = mysql.createPool({
  connectionLimit: 100,
  host: server.DB_HOST,
  port: Number(server.DB_PORT),
  user: server.DB_USER,
  password: server.DB_PASSWORD,
  database: server.DB_NAME,
  debug: false
});

export function query<Type>(q: string): Promise<Type> {
  return new Promise((res, rej) => {
    pool.query(q, (error, results) => {
      if (error) {
        return rej(error);
      }
      res(results);
    })
  })
}
