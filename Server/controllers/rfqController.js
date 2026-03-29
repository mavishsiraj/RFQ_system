import { v4 as uuid } from "uuid";
import db from "../config/db.js";
import { getLatestBidsRanked, updateAuctionStatuses } from "../services/auctionEngine.js";

export function listRfqs(req, res) {
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
}

export function getRfq(req, res) {
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
}

export function createRfq(req, res) {
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

  req.app.get("io").emit("rfq:created", rfq);

  res.status(201).json(rfq);
}