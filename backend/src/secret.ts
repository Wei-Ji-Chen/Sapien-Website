export const secret = process.env.JWT_KEY;
export const gmailUsername = process.env.GMAIL_USERNAME;
export const gmailPassword = process.env.GMAIL_PASSWORD;

if (!secret) {
  throw new Error("env variable JWT_KEY not set!");
}

if (!gmailUsername) {
  throw new Error("env variable GMAIL_USERNAME not set!");
}

if (!gmailPassword) {
  throw new Error("env variable GMAIL_PASSWORD not set!");
}
