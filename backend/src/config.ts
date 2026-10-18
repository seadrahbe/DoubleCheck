import "dotenv/config";

const env = process.env;

export const config = {
  // Render (and most hosts) assign PORT; DEV_PORT is for local development.
  port: Number(env.PORT || env.DEV_PORT) || 3056,
  // The only origin allowed to call the API cross-origin. In production, your
  // Render frontend URL.
  frontendUrl: (env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, ""),
  // IP the simulated suspicious login comes from (looked up to a location).
  simulatedLoginIp: env.SIMULATED_LOGIN_IP || "185.220.101.1",
  // Institution name Big Fish uses, incl. the support team it escalates to.
  bankName: env.BANK_NAME || "Sound Credit Union",
  tokenTtlMs: 10 * 60 * 1000,
  // Secret the user's DoubleCheck Key (Bluetooth companion) serves to prove it's
  // nearby. Same value goes into the companion app / nRF Connect.
  authDeviceKey: env.AUTH_DEVICE_KEY?.trim() || undefined,
  // Powers the Big Fish support chat. Unset → scripted fallback replies.
  anthropicApiKey: env.ANTHROPIC_API_KEY,
};
