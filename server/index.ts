import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, ts: Date.now() });
});

app.get("/", (_req, res) => {
  res.status(200).json({
    name: "Nexus Sentinel API",
    message: "Service is running",
    health: "/health",
    ts: Date.now(),
  });
});

const PORT = Number(process.env.PORT) || 200;
const HOST = "0.0.0.0"; // required for cloud
app.listen(PORT, HOST, () => {
  console.log(`Listening on http://${HOST}:${PORT}`);
});
