import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server as SocketIO } from "socket.io";

import db from "./config/db.js";
import { initSocket } from "./sockets/socketHandler.js";
import rfqRoutes from "./routes/rfqRoutes.js";
import bidRoutes from "./routes/bidRoutes.js";
import supplierRoutes from "./routes/supplierRoutes.js";

const app = express();
const httpServer = createServer(app);

const io = new SocketIO(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.set("io", io);

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
  });
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.use("/api/rfqs", rfqRoutes);
app.use("/api/rfqs/:id/bids", bidRoutes);
app.use("/api/suppliers", supplierRoutes);

const statusChecker = initSocket(io);

app.use((err, _req, res, _next) => {
  console.error("[error]", err.stack || err.message);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

function shutdown() {
  console.log("\nShutting down...");
  clearInterval(statusChecker);
  db.close();
  httpServer.close(() => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);