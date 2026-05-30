import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { initDb } from "./db.js";
import callsRouter from "./routes/calls.js";

dotenv.config();

const app = express();
const PORT = Number(process.env["PORT"] ?? 5000);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env["FRONTEND_URL"] ?? "http://localhost:3000",
  credentials: true,
}));
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/calls", callsRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err.message);

  // Multer errors (file size, wrong type) come through here
  if (err.message.startsWith("Unsupported file type") || err.message.includes("File too large")) {
    res.status(400).json({ error: err.message });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
