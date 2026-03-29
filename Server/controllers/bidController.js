import { v4 as uuid } from "uuid";
import db from "../config/db.js";
import {
  processBid,
  getLatestBidsRanked,
  updateAuctionStatuses,
  validateBidImprovement,
} from "../services/auctionEngine.js";

export function submitBid(req, res) {
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

  const io = req.app.get("io");

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
}