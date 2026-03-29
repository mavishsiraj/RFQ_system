import db from "../config/db.js";
import { updateAuctionStatuses } from "../services/auctionEngine.js";

export function initSocket(io) {
  io.on("connection", (socket) => {
    console.log(`[ws] client connected: ${socket.id}`);

    socket.on("auction:join", (rfqId) => {
      socket.join(rfqId);
      console.log(`[ws] ${socket.id} joined auction ${rfqId}`);
    });

    socket.on("auction:leave", (rfqId) => {
      socket.leave(rfqId);
    });

    socket.on("disconnect", () => {
      console.log(`[ws] client disconnected: ${socket.id}`);
    });
  });

  const statusChecker = setInterval(() => {
    try {
      const closed = updateAuctionStatuses();
      for (const id of closed) {
        const rfq = db.prepare(`SELECT * FROM rfqs WHERE id = ?`).get(id);
        io.to(id).emit("auction:closed", rfq);
        io.emit("rfq:updated", { id, status: rfq.status });
      }
    } catch (err) {
      console.error("[status-checker] error:", err.message);
    }
  }, 15_000);

  return statusChecker;
}