import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server as SocketIO } from "socket.io";
import { v4 as uuid } from "uuid";

import db from "./db.js";
import {
  processBid,
  getLatestBidsRanked,
  updateAuctionStatuses,
  validateBidImprovement,
} from "./auctionEngine.js";

const app = express();
const httpServer = createServer(app);

const io = new SocketIO(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

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

app.get("/api/rfqs", (_req, res) => {
  updateAuctionStatuses(); 

  const rfqs = db
    .prepare(
      `SELECT r.*,
              (SELECT MIN(b.total_price) FROM bids b WHERE b.rfq_id = r.id) AS lowest_bid,
              (SELECT COUNT(DISTINCT b.supplier_id) FROM bids b WHERE b.rfq_id = r.id) AS bid_count
       FROM rfqs r
       ORDER BY r.created_at DESC`
    )
    .all();

  res.json(rfqs);
});


app.get("/api/rfqs/:id", (req, res) => {
  updateAuctionStatuses();

  const rfq = db.prepare(`SELECT * FROM rfqs WHERE id = ?`).get(req.params.id);
  if (!rfq) return res.status(404).json({ error: "RFQ not found" });

  const ranked = getLatestBidsRanked(req.params.id);

  const getSupplierName = db.prepare(`SELECT name FROM suppliers WHERE id = ?`);
  const bidsWithNames = ranked.map((b) => ({
    ...b,
    supplier_name: getSupplierName.get(b.supplier_id)?.name ?? "Unknown",
  }));

  const logs = db
    .prepare(`SELECT * FROM activity_log WHERE rfq_id = ? ORDER BY created_at DESC`)
    .all(req.params.id);

  res.json({ rfq, bids: bidsWithNames, activity_log: logs });
});

app.post("/api/rfqs", (req, res) => {
  const {
    name,
    reference_id,
    bid_start_time,
    bid_close_time,
    forced_close,
    pickup_date,
    trigger_window_mins = 10,
    extension_dur_mins = 5,
    extension_trigger = "BID_RECEIVED",
    max_extensions = 0,
    min_bid_decrement = 0,
  } = req.body;

  if (!name || !reference_id || !bid_start_time || !bid_close_time || !forced_close) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const startMs = new Date(bid_start_time).getTime();
  const closeMs = new Date(bid_close_time).getTime();
  const forcedMs = new Date(forced_close).getTime();

  if (isNaN(startMs) || isNaN(closeMs) || isNaN(forcedMs)) {
    return res.status(400).json({ error: "Invalid date format in time fields" });
  }

  if (startMs >= closeMs) {
    return res.status(400).json({ error: "Bid Start Time must be before Bid Close Time" });
  }
  if (forcedMs <= closeMs) {
    return res.status(400).json({ error: "Forced Bid Close Time must be after Bid Close Time" });
  }

  const validTriggers = ["BID_RECEIVED", "RANK_CHANGE", "L1_CHANGE"];
  if (!validTriggers.includes(extension_trigger)) {
    return res.status(400).json({ error: "Invalid extension_trigger value" });
  }

  if (trigger_window_mins < 1 || trigger_window_mins > 120) {
    return res.status(400).json({ error: "Trigger window must be between 1 and 120 minutes" });
  }
  if (extension_dur_mins < 1 || extension_dur_mins > 60) {
    return res.status(400).json({ error: "Extension duration must be between 1 and 60 minutes" });
  }
  if (max_extensions < 0) {
    return res.status(400).json({ error: "Max extensions cannot be negative" });
  }
  if (min_bid_decrement < 0) {
    return res.status(400).json({ error: "Min bid decrement cannot be negative" });
  }

  const existingRef = db.prepare(`SELECT id FROM rfqs WHERE reference_id = ?`).get(reference_id);
  if (existingRef) {
    return res.status(400).json({ error: `Reference ID "${reference_id}" already exists` });
  }

  const id = uuid();
  const now = new Date();
  const status = startMs <= now.getTime() ? "ACTIVE" : "DRAFT";

  db.prepare(
    `INSERT INTO rfqs (id, name, reference_id, bid_start_time, bid_close_time,
       original_close, forced_close, pickup_date, status,
       trigger_window_mins, extension_dur_mins, extension_trigger,
       max_extensions, min_bid_decrement)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, name, reference_id, bid_start_time, bid_close_time,
    bid_close_time, forced_close, pickup_date || null, status,
    trigger_window_mins, extension_dur_mins, extension_trigger,
    max_extensions, min_bid_decrement
  );

  db.prepare(
    `INSERT INTO activity_log (rfq_id, event_type, description)
     VALUES (?, 'RFQ_CREATED', ?)`
  ).run(id, `RFQ "${name}" created with British Auction enabled`);

  const rfq = db.prepare(`SELECT * FROM rfqs WHERE id = ?`).get(id);

  io.emit("rfq:created", rfq);
  res.status(201).json(rfq);
});

app.post("/api/rfqs/:id/bids", (req, res) => {
  updateAuctionStatuses();

  const rfq = db.prepare(`SELECT * FROM rfqs WHERE id = ?`).get(req.params.id);
  if (!rfq) return res.status(404).json({ error: "RFQ not found" });

  if (rfq.status !== "ACTIVE") {
    return res.status(400).json({ error: `Auction is ${rfq.status}. Cannot accept bids.` });
  }

  const {
    supplier_id,
    freight_charges = 0,
    origin_charges = 0,
    destination_charges = 0,
    transit_time_days,
    quote_validity,
  } = req.body;

  if (!supplier_id) {
    return res.status(400).json({ error: "supplier_id is required" });
  }

  const supplier = db.prepare(`SELECT * FROM suppliers WHERE id = ?`).get(supplier_id);
  if (!supplier) return res.status(404).json({ error: "Supplier not found" });

  const fc = Number(freight_charges);
  const oc = Number(origin_charges);
  const dc = Number(destination_charges);

  if (fc < 0 || oc < 0 || dc < 0) {
    return res.status(400).json({ error: "Charge amounts cannot be negative" });
  }

  const total_price = fc + oc + dc;
  if (total_price <= 0) {
    return res.status(400).json({ error: "Total bid price must be greater than zero" });
  }

  const improvement = validateBidImprovement(req.params.id, supplier_id, total_price);
  if (!improvement.valid) {
    return res.status(400).json({ error: improvement.error });
  }

  const previousRanked = getLatestBidsRanked(req.params.id);

  const bidId = uuid();

  db.prepare(
    `INSERT INTO bids (id, rfq_id, supplier_id, freight_charges, origin_charges,
       destination_charges, total_price, transit_time_days, quote_validity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    bidId, req.params.id, supplier_id,
    fc, oc, dc,
    total_price, transit_time_days || null, quote_validity || null
  );

  db.prepare(
    `INSERT INTO activity_log (rfq_id, event_type, description, metadata)
     VALUES (?, 'BID_SUBMITTED', ?, ?)`
  ).run(
    req.params.id,
    `${supplier.name} submitted a bid of $${total_price.toFixed(2)}`,
    JSON.stringify({ bid_id: bidId, supplier_id, total_price })
  );

  try {
    const result = processBid(req.params.id, previousRanked);

    io.to(req.params.id).emit("auction:update", {
      rfqId: req.params.id,
      ranked: result.ranked,
      extended: result.extended,
      newCloseTime: result.newCloseTime,
      reason: result.reason,
    });

    if (result.extended) {
      io.emit("rfq:updated", {
        id: req.params.id,
        bid_close_time: result.newCloseTime,
      });
    }

    const bid = db.prepare(`SELECT * FROM bids WHERE id = ?`).get(bidId);
    res.status(201).json({
      bid,
      auction: {
        extended: result.extended,
        newCloseTime: result.newCloseTime,
        reason: result.reason,
        rankings: result.ranked,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/suppliers", (_req, res) => {
  const suppliers = db.prepare(`SELECT * FROM suppliers ORDER BY name`).all();
  res.json(suppliers);
});

app.post("/api/suppliers", (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name is required" });

  const trimmed = name.trim();
  const existing = db.prepare(`SELECT id FROM suppliers WHERE name = ?`).get(trimmed);
  if (existing) {
    return res.status(400).json({ error: `Supplier "${trimmed}" already exists` });
  }

  const id = uuid();
  db.prepare(`INSERT INTO suppliers (id, name) VALUES (?, ?)`).run(id, trimmed);
  res.status(201).json({ id, name: trimmed });
});



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