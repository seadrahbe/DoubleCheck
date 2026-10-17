// `npm run trigger` (text) or `npm run trigger -- email`: simulate a suspicious login against the running server.
import { config } from "./config.js";

const channel = process.argv[2] === "email" ? "email" : "sms";
const res = await fetch(`http://localhost:${config.port}/api/login-attempts`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ channel }),
});
const data = await res.json();
console.log(res.status, data);
