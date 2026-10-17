import "dotenv/config";

const env = process.env;

export const config = {
  port: Number(env.DEV_PORT) || 3056,
  // Base URL the survey link in the text points to. Must be reachable from
  // your phone, so use your LAN IP or a tunnel (ngrok etc.), not localhost.
  frontendUrl: (env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, ""),
  // IP the simulated suspicious login comes from (looked up to a location).
  simulatedLoginIp: env.SIMULATED_LOGIN_IP || "185.220.101.1",
  tokenTtlMs: 10 * 60 * 1000,
  twilio: {
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    fromNumber: env.TWILIO_FROM_NUMBER,
  },
  smtp: {
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT) || 587,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM,
  },
  // The only number / address messages are ever sent to.
  myPhoneNumber: env.MY_PHONE_NUMBER,
  myEmail: env.MY_EMAIL,
};
