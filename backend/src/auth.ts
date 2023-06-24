import { Request, Response, NextFunction } from 'express';
import * as db from './db';
import { escape } from 'mysql';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { secret, gmailUsername, gmailPassword } from './secret';
import * as nodemailer from 'nodemailer';
import { MailOptions } from 'nodemailer/lib/json-transport';

const transporter =
  process.env.MODE == "development" ? null : nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: gmailUsername,
      pass: gmailPassword
    }
  });

async function sendMail(mail: MailOptions) {
  if (transporter) {
    return await transporter.sendMail(mail);
  }
  console.log("Mail not sent in dev mode.")
  console.log(JSON.stringify(mail));
}

export interface UserEntry {
  email: string;
  password: string;
  firstName: string;
  middleName: string;
  lastName: string;
  affiliation: string;
  purpose: string;
}

export interface UserEntryBulkCreate {
  email: string;
  firstName: string;
  middleName: string;
  lastName: string;
  affiliation: string;
  purpose: string;
}

function validateEmail(email: string) {
  return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,10})+$/.test(email);
}

function validatePassword(password: string) {
  return password.length >= 8;
}

function validateName(firstName: string, middleName: string, lastName: string) {
  return firstName.length > 0 && lastName.length > 0;
}

function validateAffiliation(affiliation: string) {
  return affiliation.length > 0;
}

function validatePurpose(purpose: string) {
  return purpose.length > 0;
}

function validateUser(user: UserEntry) {
  return validateEmail(user.email) &&
    validatePassword(user.password) &&
    validateName(user.firstName, user.middleName, user.lastName) &&
    validateAffiliation(user.affiliation) &&
    validatePurpose(user.purpose);
}

export async function createUser(user: UserEntry) {
  if (!validateUser(user)) {
    throw { msg: "Invalid properties in user", code: 'ER_INVALID_USER' };
  }

  const email = escape(user.email);
  const hashedPassword = escape(await bcrypt.hash(user.password, 10));
  const firstName = escape(user.firstName);
  const middleName = escape(user.middleName);
  const lastName = escape(user.lastName);
  const affiliation = escape(user.affiliation);
  const purpose = escape(user.purpose);
  const query = `INSERT INTO UserEntry (email, password, firstName, middleName, lastName, affiliation, purpose) VALUES (${email}, ${hashedPassword}, ${firstName}, ${middleName}, ${lastName}, ${affiliation}, ${purpose})`;
  await db.query(query);

  return user;
}

export async function bulkCreateUsers(users: UserEntryBulkCreate[]) {
  for (let user of users) {

    if (!validateEmail(user.email)) {
      throw { msg: `${user.email} has invalid email.` }
    }
    if (!validateName(user.firstName, user.middleName, user.lastName)) {
      throw { msg: `${user.email} has invalid name (first, middle, or last).` }
    }
    if (!validateAffiliation(user.affiliation)) {
      throw { msg: `${user.email} has affiliation.` }
    }
    if (!validatePurpose(user.purpose)) {
      throw { msg: `${user.email} has invalid purpose.` }
    }

    const query = `SELECT email FROM UserEntry where email = ${escape(user.email)}`;
    if ((await db.query<any[]>(query)).length) {
      throw { msg: `${user.email} already has an account.` }
    }
  }

  for (let user of users) {
    let {email, firstName, middleName, lastName, affiliation, purpose} = user;
    email = email.trim();
    firstName = firstName.trim();
    middleName = middleName.trim();
    lastName = lastName.trim();
    affiliation = affiliation.trim();
    purpose = purpose.trim();
    const query = `INSERT INTO UserEntry (email, password, firstName, middleName, lastName, affiliation, purpose, privilege) VALUES (${escape(email)}, ${escape("")}, ${escape(firstName)}, ${escape(middleName)}, ${escape(lastName)}, ${escape(affiliation)}, ${escape(purpose)}, '1')`;
    await db.query(query);
  }
}



export function createEmailToken(email: string, expiresIn: number | string) {
  return new Promise<string>((res, rej) => {
    jwt.sign({ email, emailVerification: true }, secret, { expiresIn }, (err, encoded) => {
      if (err) {
        return rej(err);
      }
      return res(encoded);
    });
  })
}

export async function verifyEmailToken(token: string) {
  const decoded: any = await new Promise<{ email: string, emailVerification: boolean }>((res, rej) => {
    jwt.verify(token, secret, (err: jwt.VerifyErrors, decoded: any) => {
      if (err) {
        rej({ msg: 'invalid token' });
      } else {
        res(decoded);
      }
    })
  });
  if (!decoded.emailVerification) {
    throw { msg: 'invalid token' };
  }

  const query = `SELECT version, privilege FROM UserEntry WHERE email = ${escape(decoded.email)}`
  const results = await db.query(query) as { version: number, privilege: number }[];
  if (results.length !== 1) {
    throw { msg: 'invalid token' }
  }
  return { email: decoded.email, privilege: results[0].privilege, version: results[0].version };
}


export function createToken(email: string, version: number, expiresIn?: string) {
  if (expiresIn) {
    return new Promise<string>((res, rej) => {
      jwt.sign({ email, version }, secret, { expiresIn }, (err, encoded) => {
        if (err) {
          return rej(err);
        }
        return res(encoded);
      });
    })
  }
  return new Promise<string>((res, rej) => {
    jwt.sign({ email, version }, secret, {}, (err, encoded) => {
      if (err) {
        return rej(err);
      }
      return res(encoded);
    });
  })
}

export async function verifyToken(token: string) {
  const decoded: any = await new Promise<{ email: string, version: number }>((res, rej) => {
    jwt.verify(token, secret, (err: jwt.VerifyErrors, decoded: any) => {
      if (err) {
        rej({ msg: 'invalid token' });
      } else {
        res(decoded);
      }
    })
  });
  const query = `SELECT version, privilege FROM UserEntry WHERE email = ${escape(decoded.email)}`
  const results = await db.query(query) as { version: number, privilege: number }[];
  if (results.length !== 1) {
    throw { msg: 'invalid token' }
  }
  if (results[0].version !== decoded.version) {
    throw { msg: 'invalid token' }
  }
  return { email: decoded.email, privilege: results[0].privilege };
}

export function createEmailLoginToken(email: string) {
  return new Promise<string>((res, rej) => {
    jwt.sign({ email, emailLogin: true }, secret, { expiresIn: "1h" }, (err, encoded) => {
      if (err) {
        return rej(err);
      }
      return res(encoded);
    })
  })
}

export async function verifyEmailLoginToken(token: string) {
  const decoded: any = await new Promise<{ email: string, emailLogin: boolean }>((res, rej) => {
    jwt.verify(token, secret, (err: jwt.VerifyErrors, decoded: any) => {
      if (err) {
        rej({ msg: 'invalid token' });
      } else {
        res(decoded);
      }
    })
  });
  if (!decoded.emailLogin) {
    throw { msg: 'invalid token' };
  }

  const query = `SELECT version, privilege FROM UserEntry WHERE email = ${escape(decoded.email)}`
  const results = await db.query(query) as { version: number, privilege: number }[];
  if (results.length !== 1) {
    throw { msg: 'invalid token' }
  }
  return { email: decoded.email, privilege: results[0].privilege, version: results[0].version };
}

export function createResetPasswordToken(email: string) {
  return new Promise<string>((res, rej) => {
    jwt.sign({ email, resetPassword: true }, secret, { expiresIn: "1h" }, (err, encoded) => {
      if (err) {
        return rej(err);
      }
      return res(encoded);
    })
  })
}

export async function verifyEmailResetPasswordToken(token: string) {
  const decoded: any = await new Promise<{ email: string, resetPassword: boolean }>((res, rej) => {
    jwt.verify(token, secret, (err: jwt.VerifyErrors, decoded: any) => {
      if (err) {
        rej({ msg: 'invalid token' });
      } else {
        res(decoded);
      }
    })
  });
  if (!decoded.resetPassword) {
    throw { msg: 'invalid token' };
  }

  const query = `SELECT version, privilege FROM UserEntry WHERE email = ${escape(decoded.email)}`
  const results = await db.query(query) as { version: number, privilege: number }[];
  if (results.length !== 1) {
    throw { msg: 'invalid token' }
  }
  return { email: decoded.email, privilege: results[0].privilege, version: results[0].version };
}

export async function setPassword(email: string, password: string) {
  const hashedPassword = await bcrypt.hash(password, 10);
  const query = `update UserEntry SET password = ${escape(hashedPassword)} WHERE email = ${escape(email)}`;
  await db.query(query);
}

export async function createAuthorizationToken(email: string, privilege: number, ip: string, expiresIn: number | string) {
  return new Promise<string>((res, rej) => {
    jwt.sign({ email, ip, privilege }, secret, { expiresIn }, (err, encoded) => {
      if (err) {
        return rej(err);
      }
      return res(encoded);
    });
  })
}

export async function createPythonAuthorizationToken(email: string, privilege: number, ip: string, expiresIn: number | string) {
  return new Promise<string>((res, rej) => {
    jwt.sign({ email, ip, privilege, fileOnly: true }, secret, { expiresIn }, (err, encoded) => {
      if (err) {
        return rej(err);
      }
      return res(encoded);
    });
  })
}

export async function verifyAuthorizationToken(token: string, ip: string) {
  const decoded = await new Promise<{ email: string, ip: string, privilege: number }>((res, rej) => {
    jwt.verify(token, secret, (err: jwt.VerifyErrors, decoded: any) => {
      if (err) {
        console.log(err);
        rej({ msg: 'invalid token' });
      } else {
        res(decoded);
      }
    })
  });
  if (decoded.ip !== ip) {
    throw { msg: 'invalid ip' }
  }
  return decoded;
}


export async function login(email?: string, password?: string, authToken?: string) {
  if (authToken) {
    try {
      const { email } = await verifyToken(authToken);
      console.log(email);
      const query = `SELECT email, version FROM UserEntry where email = ${escape(email)}`
      const results = await db.query(query) as { email: string, version: number }[];
      if (results.length !== 1) {
        throw { msg: 'Invalid Token', code: 'ER_INVALID_TOKEN' };
      }
      const token = await createToken(results[0].email, results[0].version);
      return token;
    } catch {
      throw { msg: 'Invalid Token', code: 'ER_INVALID_TOKEN' };
    }
  }

  const query = `SELECT email, password, version FROM UserEntry where email = ${escape(email)}`
  const results = await db.query(query) as { email: string, password: string, version: number }[];

  if (results.length !== 1) {
    throw { msg: 'Invalid Email', code: 'ER_INVALID_EMAIL' };
  }
  const hashedPassword = results[0].password;

  const success = await bcrypt.compare(password, hashedPassword)
  const token = await createToken(results[0].email, results[0].version);

  if (success) {
    return token;
  }
  throw { msg: 'Invalid Password', code: 'ER_INVALID_PASSWORD' };
}

export async function logout(email: string) {
  const query = `UPDATE UserEntry SET version = version + 1 WHERE email = ${escape(email)}`
  const results = await db.query(query);
  return { success: true };
}

export function authorizeByQuery(privilege: number) {
  return function(req: Request, res: Response, next: NextFunction) {
    const ip = req.headers['x-real-ip'] as string;
    verifyAuthorizationToken(req.query.token.toString(), ip).then(user => {
      if (user.privilege < privilege) {
        if (user.privilege === 0 && privilege === 1) {
          return res.status(401).send({ msg: 'you need to verify your email first.' })
        }
        return res.status(401).send({ msg: 'you cannot access this information.' })
      }
      req['user'] = user;
      next();
    }).catch(err => {
      console.log(err);
      res.status(401).send({ msg: 'invalid token.' })
    });
  }
}

export function authorize(privilege: number) {
  return function(req: Request, res: Response, next: NextFunction) {
    const ip = req.headers['x-real-ip'] as string;
    let token = req.cookies["authorization"] as string;
    if (!token) {
      token = req.header("Authorization");
    }
    verifyAuthorizationToken(token, ip).then(user => {
      if (user["fileOnly"]) {
        res.clearCookie("authorization");
        return res.status(401).send({ msg: "invalid token." })
      }
      if (user.privilege < privilege) {
        if (user.privilege === 0 && privilege === 1) {
          return res.status(401).send({ msg: 'you need to verify your email first.' })
        }
        return res.status(401).send({ msg: 'you cannot access this information.' })
      }
      req['user'] = user;
      next();
    }).catch(err => {
      console.log(err);
      res.clearCookie("authorization");
      res.status(401).send({ msg: 'invalid token.' })
    });
  }
}

// TODO: check version
export function authenticate(privilege: number) {
  return function(req: Request, res: Response, next: NextFunction) {
    verifyToken(req.cookies["authentication"] || req.header('Authentication')).then(user => {
      if (user.privilege < privilege) {
        if (user.privilege === 0 && privilege === 1) {
          return res.status(401).send({ msg: 'you need to verify your email first.' })
        }
        return res.status(401).send({ msg: 'you cannot access this information.' })
      }
      req['user'] = user;
      next();
    }).catch(err => {
      console.log(err);
      res.status(401).send({ msg: 'invalid token.' })
    });
  }
}

// for automatically activate account
export async function sendManualVerificationEmail(email: string) {
  const url = 'https://sapien.ucsd.edu';
  await sendMail({
    from: '"SAPIEN" <sapienaicontact@gmail.com>',
    to: email,
    subject: "SAPIEN account activation", // Subject line
    html: `We have activated your SAPIEN account. Please login at <a href="${url}">${url}</a>`
  });
}

// for automatically activate account
export async function sendEmail(email: string, token: string) {
  const url = `https://sapien.ucsd.edu/user/verify?token=${token}`;
  console.log('sending email to', url);
  await sendMail({
    from: '"SAPIEN" <sapienaicontact@gmail.com>',
    to: email,
    subject: "SAPIEN account activation", // Subject line
    html: `<p>Click the following link to activate your account <a href="${url}">${url}</a></p>`
  });
}

// for forget login link
export async function sendLoginLink(email: string, token: string) {
  const url = `https://sapien.ucsd.edu?token=${token}`
  console.log('sending login email to', email);
  await sendMail({
    from: '"SAPIEN" <sapienaicontact@gmail.com>',
    to: email,
    subject: "SAPIEN Login", // Subject line
    html: `<p>Click the following link to login to your account <a href="${url}">${url}</a></p>`
  });
}

function makeid(length: number) {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  for (let i = 0; i < length; ++i) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

export async function sendResetPasswordEmail(email: string) {
  console.log('resetting password for', email);

  const query = `update UserEntry SET password = "" WHERE email = ${escape(email)}`;
  await db.query(query);

  const token = await createResetPasswordToken(email);
  const url = `https://sapien.ucsd.edu/reset-password?reset_token=${token}`
  console.log(url);

  await sendMail({
    from: '"SAPIEN" <sapienaicontact@gmail.com>',
    to: email,
    subject: "SAPIEN reset password",
    html: `<p>Please go to the following link to reset your password: <a href="${url}">${url}</a></p>`
  });
}

export async function changePrivilege(email: string, privilege: number) {
  const query = `UPDATE UserEntry SET privilege = ${escape(privilege)} WHERE email = ${escape(email)}`;
  await db.query(query)
}

export async function getInfo(email: string) {
  const query = `SELECT email, firstName, middleName, lastName, affiliation, privilege FROM UserEntry WHERE email = ${escape(email)}`;
  const result = await db.query(query) as any[];
  if (result.length !== 1) {
    throw { msg: 'invalid email.' }
  }
  return result[0];
}

export async function verifyTokenSignature(token: string) {
  const decoded: any = await new Promise<any>((res, rej) => {
    jwt.verify(token, secret, (err: jwt.VerifyErrors, decoded: any) => {
      if (err) {
        rej({ msg: 'invalid token' });
      } else {
        res(decoded);
      }
    })
  });
  return decoded;
}
