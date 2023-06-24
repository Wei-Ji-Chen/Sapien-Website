import { Router } from 'express';
import { query } from '../db';
import { escape } from 'mysql';
import { authenticate, createUser, login, sendEmail, changePrivilege, getInfo, createEmailToken, verifyEmailToken, createToken, createAuthorizationToken, sendLoginLink, sendManualVerificationEmail, createPythonAuthorizationToken, sendResetPasswordEmail, verifyEmailResetPasswordToken, setPassword, verifyTokenSignature, authorize, bulkCreateUsers } from '../auth';
import { TRUSTED_EMAIL_REGEX, TRUSTED_EMAIL_SUFFIX } from '../config';

export const userRouter = Router();

function isTrustedEmail(email: string) {
  return TRUSTED_EMAIL_REGEX.some(regex => email.match(regex) != null) || TRUSTED_EMAIL_SUFFIX.some(suffix => email.endsWith(suffix));
}

userRouter.post('/login', async (req, res) => {
  let { email, password, token } = req.body;
  try {
    const token2 = await login(email, password, token);
    res.cookie("authentication", token2, { httpOnly: true, sameSite: "lax", secure: true })
    res.send({ token: token2 });
  } catch (err) {
    if (err.code === 'ER_INVALID_EMAIL' ||
      err.code === 'ER_INVALID_PASSWORD' ||
      err.code === 'ER_INVALID_TOKEN'
    ) {
      return res.sendStatus(401);
    }
    console.log(err);
    res.sendStatus(500);
  }
});

userRouter.post('/logout', async (req, res) => {
  res.clearCookie("authentication");
  res.clearCookie("authorization");
  res.end();
});

userRouter.post('/signup', async (req, res) => {
  const { email, password, firstName, middleName, lastName, affiliation, purpose } = req.body;
  const ip = req.headers['x-real-ip'] as string;

  try {
    await createUser({
      email, password, firstName, middleName, lastName, affiliation, purpose
    });
    const token = await createEmailToken(email, '12h');
    if (isTrustedEmail(email)) {
      sendEmail(email, token);
      return res.send({ success: true, msg: 'email sent' });
    }
    return res.send({ success: false, msg: 'Please wait for manual verification or use a .edu email.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      res.send({ success: false, msg: 'This email is already registered.' });
      return;
    } else if (err.code == 'ER_INVALID_USER') {
      res.send({ success: false, msg: 'The email or password is invalid. Try registering with another email.' });
      return;
    }
    console.log(err.code, err);
    res.sendStatus(500);
  }
});

userRouter.post('/resend-email', authenticate(0), async (req, res) => {
  const user = req['user'];
  try {
    const token = await createEmailToken(user.email, '12h');

    if (isTrustedEmail(user.email)) {
      sendEmail(user.email, token);
      return res.send({ success: true, msg: 'email sent' });
    }
    return res.send({ success: false, msg: 'Please wait for manual verification or use a .edu email.' });
  } catch (err) {
    res.status(500).send({ msg: 'Resend email failed. Please try again later and then contact admin.' });
  }
});

userRouter.post('/email-login', async (req, res) => {
  const { email } = req.body;
  try {
    const result = await query(`SELECT email, version FROM UserEntry where email = ${escape(email)}`) as any[];
    if (!result.length) {
      return res.end();
    }
    const token = await createToken(result[0].email, result[0].version, '1d');
    await sendLoginLink(result[0].email, token);
    return res.end();
  } catch (err) {
    res.status(500).send({ msg: 'Send email failed. Please try again later and then contact admin.' });
  }
});

userRouter.post('/email-reset-password', async (req, res) => {
  const { email } = req.body;
  try {
    const entry = await query(`SELECT version, privilege FROM UserEntry WHERE email = ${escape(email)}`) as any[];

    if (!entry.length) {
      return res.end();
    }

    await sendResetPasswordEmail(email);
    return res.end();

  } catch (err) {
    res.status(500).send({ msg: 'Failed to send email. Please try again later and then contact admin.' })
  }
});

userRouter.post('/reset-password', async (req, res) => {
  const { email, password, token } = req.body;
  try {
    const result = await verifyEmailResetPasswordToken(token);
    if (result.email !== email) {
      throw {};
    }
    await setPassword(email, password);
    res.end()
  } catch (err) {
    console.log(err);
    res.status(400).send({ msg: 'Failed to reset password. Please try again and contact admin.' })
  }
});


userRouter.get('/verify', async (req, res) => {
  const token = req.query.token.toString();
  try {
    const result = await verifyEmailToken(token);
    if (result.privilege !== 0) {
      console.log('trying to activate again');
      return res.status(401).send('This account is already activated');
    }
    await changePrivilege(result.email, 1);
    const token2 = await createToken(result.email, result.version);
    res.redirect(`/?token=${token2}`);
  } catch (err) {
    res.status(401).send('Invalid or expired authentication link.');
  }
});

userRouter.get('/info', authenticate(0), async (req, res) => {
  try {

    const info = await getInfo(req['user'].email);
    info.authenticationToken = req.cookies["authentication"];
    res.send(info);
  } catch (err) {
    res.sendStatus(500);
  }
});

userRouter.get('/refresh-token', authenticate(0), async (req, res) => {
  try {
    const ip = req.headers['x-real-ip'] as string;
    const token = await createAuthorizationToken(req['user'].email, req['user'].privilege, ip, '24h');
    res.cookie("authorization", token, { httpOnly: true, sameSite: "strict", secure: true })
    res.send({ token });
  } catch (err) {
    res.sendStatus(500);
  }
})

userRouter.get('/generate-python-token', authenticate(1), async (req, res) => {
  try {
    const ip = req.headers['x-real-ip'] as string;
    const token = await createPythonAuthorizationToken(req['user'].email, req['user'].privilege, ip, '365d');
    res.send({ token });
  } catch (err) {
    res.sendStatus(500);
  }
})

userRouter.get('/user', authenticate(5), async (req, res) => {
  const email = req.query.email;
  const users = await query(`select email, firstName, middleName, lastName, affiliation, purpose, privilege, creationTime from UserEntry where email = ${escape(email)}`);
  res.send(users);
});

userRouter.get('/all-users/count', authenticate(5), async (req, res) => {
  const users = await query(`select COUNT(*) as count from UserEntry`);
  res.send(users[0]);
});

userRouter.get('/all-users', authenticate(5), async (req, res) => {
  const offset = Number(req.query.offset) || 0;
  const limit = Number(req.query.limit) || 100;
  const users = await query(`select email, firstName, middleName, lastName, affiliation, purpose, privilege, creationTime from UserEntry order by creationTime desc LIMIT ${Number(limit)} OFFSET ${Number(offset)}`);
  res.send(users);
});

userRouter.post('/authorize-user', authenticate(5), async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      throw { msg: 'invalid email' };
    }
    await changePrivilege(email, 1);
    sendManualVerificationEmail(email);
    res.end();
  } catch (err) {
    if (err.msg) {
      res.status(400).send(err);
    } else {
      res.sendStatus(500);
    }
  }
});

userRouter.post('/set-privilege', authenticate(5), async (req, res) => {
  try {
    const { email, privilege } = req.body;
    if (!email) {
      throw { msg: 'invalid email' };
    }
    if (req['user'].email == email) {
      throw { msg: 'cannot change privilege of self' }
    }
    const p = Number(privilege);
    await changePrivilege(email, p);
    res.end();
  } catch (err) {
    if (err.msg) {
      res.status(400).send(err);
    } else {
      res.sendStatus(500);
    }
  }
});

userRouter.get('/verify-token-signature', async (req, res) => {
  try {
    const token = String(req.query.token);
    if (!token) {
      throw { msg: 'invalid token' };
    }
    await verifyTokenSignature(token);
    res.end();
  } catch (err) {
    if (err.msg) {
      res.status(400).send(err);
    } else {
      res.sendStatus(500);
    }
  }
});

userRouter.get('/request-user-info', async (req, res) => {
  try {
    const token = String(req.query.token);
    if (!token) {
      throw { msg: 'invalid token' };
    }
    const info = await verifyTokenSignature(token);
    const users = await query<any[]>(`select email, affiliation from UserEntry where email = ${escape(info.email)}`);
    if (!users.length) {
      throw {msg: "invalid email"}
    } else {
      res.send(users[0]);
    }
  } catch (err) {
    if (err.msg) {
      res.status(400).send(err);
    } else {
      res.sendStatus(500);
    }
  }
});

userRouter.post('/bulk-create-accounts', authenticate(5), async (req, res) => {
  try {
    await bulkCreateUsers(req.body);
    res.end();
  } catch (err) {
    if (err.msg) {
      res.status(400).send(err);
    } else {
      res.sendStatus(500);
    }
  }
});

userRouter.post('/generate-tokens-for-users', authenticate(5), async (req, res) => {
  try {
    if (!(req.body instanceof Array)) {
      throw {msg: "invalid users"}
    }
    const tokens = [] as string[];
    for (let email of req.body) {
      const result = await query(`SELECT email, version FROM UserEntry where email = ${escape(email)}`) as any[];
      if (result.length == 0) {
        throw {msg: `user ${email} does not exist.`}
      }
      const token = await createToken(email, result[0].version, "3d")
      tokens.push(token);
    }
    res.send(tokens);
  } catch (err) {
    if (err.msg) {
      res.status(400).send(err);
    } else {
      res.sendStatus(500);
    }
  }
});
