import "dotenv/config";

const env = process.env;

export const config = {
  // Render (and most hosts) assign PORT; DEV_PORT is for local development.
  port: Number(env.PORT || env.DEV_PORT) || 3056,
  // Base URL the survey link in the text points to, and the only origin allowed
  // to call the API cross-origin. In production, your Render frontend URL.
  frontendUrl: (env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, ""),
  // IP the simulated suspicious login comes from (looked up to a location).
  simulatedLoginIp: env.SIMULATED_LOGIN_IP || "185.220.101.1",
  tokenTtlMs: 10 * 60 * 1000,
  twilio: {
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    fromNumber: env.TWILIO_FROM_NUMBER,
  },
  resend: {
    apiKey: env.RESEND_API_KEY,
    // resend.dev's shared sender works without owning a domain.
    from: env.EMAIL_FROM || "DoubleCheck <onboarding@resend.dev>",
  },
  // The only number / address messages are ever sent to.
  myPhoneNumber: env.MY_PHONE_NUMBER,
  myEmail: env.MY_EMAIL,
};
