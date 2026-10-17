import cors from "cors";
import express from "express";
import { config } from "./config.js";
import { router } from "./routes.js";

const app = express();

// In dev the Vite proxy makes requests same-origin; in production the frontend
// is a separate Render service, so allow its origin.
app.use(cors({ origin: config.frontendUrl }));
app.use(express.json());
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});
app.use("/api", router);

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Server running on port ${config.port}`);
});
