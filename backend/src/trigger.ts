// `npm run trigger` (text) or `npm run trigger -- email`: simulate a suspicious login against the running server.
import { config } from "./config.js";

const channel = process.argv[2] === "email" ? "email" : "sms";
const url = `http://localhost:${config.port}/api/login-attempts`;

try {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel }),
  });
  console.log(res.status, await res.json());
} catch {
  console.error(`Couldn't reach the backend at ${url}. Start it in another terminal with \`npm run dev\` and try again.`);
  process.exitCode = 1;
}
