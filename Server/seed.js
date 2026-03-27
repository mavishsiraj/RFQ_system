import db from "./db.js";
import { v4 as uuid } from "uuid";

console.log("Seeding database...\n");

db.exec(`DELETE FROM activity_log; DELETE FROM bids; DELETE FROM rfqs; DELETE FROM suppliers;`);

const suppliers = [
  { id: uuid(), name: "FastFreight Logistics" },
  { id: uuid(), name: "OceanBridge Shipping" },
  { id: uuid(), name: "AirCargo Express" },
  { id: uuid(), name: "Continental Movers" },
  { id: uuid(), name: "SwiftLine Transport" },
];

const insertSupplier = db.prepare(`INSERT INTO suppliers (id, name) VALUES (?, ?)`);
for (const s of suppliers) {
  insertSupplier.run(s.id, s.name);
  console.log(`  + Supplier: ${s.name}`);
}


const now = new Date();

function addMinutes(date, mins) {
  return new Date(date.getTime() + mins * 60 * 1000).toISOString();
}
function addHours(date, hrs) {
  return new Date(date.getTime() + hrs * 3600 * 1000).toISOString();
}
const rfqs = [
  {
    id: uuid(),
    name: "Shanghai to Mumbai Container Freight",
    reference_id: "RFQ-2026-001",
    bid_start_time: addMinutes(now, -60),
    bid_close_time: addMinutes(now, 30),
    forced_close: addHours(now, 2),
    pickup_date: addHours(now, 72),
    status: "ACTIVE",
    trigger_window_mins: 10,
    extension_dur_mins: 5,
    extension_trigger: "BID_RECEIVED",
    max_extensions: 0,
    min_bid_decrement: 0,
  },
  {
    id: uuid(),
    name: "Rotterdam to New York Ocean Freight",
    reference_id: "RFQ-2026-002",
    bid_start_time: addMinutes(now, -120),
    bid_close_time: addMinutes(now, 60),
    forced_close: addHours(now, 3),
    pickup_date: addHours(now, 96),
    status: "ACTIVE",
    trigger_window_mins: 15,
    extension_dur_mins: 10,
    extension_trigger: "RANK_CHANGE",
    max_extensions: 5,
    min_bid_decrement: 50,
  },
  {
    id: uuid(),
    name: "Dubai to London Air Cargo",
    reference_id: "RFQ-2026-003",
    bid_start_time: addMinutes(now, 30),
    bid_close_time: addHours(now, 4),
    forced_close: addHours(now, 6),
    pickup_date: addHours(now, 48),
    status: "DRAFT",
    trigger_window_mins: 5,
    extension_dur_mins: 3,
    extension_trigger: "L1_CHANGE",
    max_extensions: 3,
    min_bid_decrement: 100,
  },
];

const insertRfq = db.prepare(
  `INSERT INTO rfqs (id, name, reference_id, bid_start_time, bid_close_time,
     original_close, forced_close, pickup_date, status,
     trigger_window_mins, extension_dur_mins, extension_trigger,
     max_extensions, min_bid_decrement)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertLog = db.prepare(
  `INSERT INTO activity_log (rfq_id, event_type, description) VALUES (?, ?, ?)`
);

for (const r of rfqs) {
  insertRfq.run(
    r.id, r.name, r.reference_id, r.bid_start_time, r.bid_close_time,
    r.bid_close_time, r.forced_close, r.pickup_date, r.status,
    r.trigger_window_mins, r.extension_dur_mins, r.extension_trigger,
    r.max_extensions, r.min_bid_decrement
  );
  insertLog.run(r.id, "RFQ_CREATED", `RFQ "${r.name}" created with British Auction enabled`);
  console.log(`  + RFQ: ${r.reference_id} - ${r.name} [${r.status}]`);
}



const insertBid = db.prepare(
  `INSERT INTO bids (id, rfq_id, supplier_id, freight_charges, origin_charges,
     destination_charges, total_price, transit_time_days, quote_validity, rank, submitted_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const sampleBids = [
  { rfq: rfqs[0], supplier: suppliers[0], freight: 4500, origin: 300, dest: 250, transit: 14, validity: "30 days", minutesAgo: 45 },
  { rfq: rfqs[0], supplier: suppliers[1], freight: 4200, origin: 350, dest: 280, transit: 18, validity: "30 days", minutesAgo: 30 },
  { rfq: rfqs[0], supplier: suppliers[2], freight: 5100, origin: 200, dest: 150, transit: 7,  validity: "15 days", minutesAgo: 20 },
  { rfq: rfqs[1], supplier: suppliers[3], freight: 8200, origin: 500, dest: 600, transit: 21, validity: "45 days", minutesAgo: 90 },
  { rfq: rfqs[1], supplier: suppliers[4], freight: 7800, origin: 450, dest: 550, transit: 25, validity: "30 days", minutesAgo: 60 },
];

let grouped = {};
for (const b of sampleBids) {
  const total = b.freight + b.origin + b.dest;
  const rfqId = b.rfq.id;
  if (!grouped[rfqId]) grouped[rfqId] = [];
  grouped[rfqId].push({ total, bid: b });
}

for (const rfqId of Object.keys(grouped)) {
  grouped[rfqId].sort((a, b) => a.total - b.total);
  grouped[rfqId].forEach((item, idx) => {
    const b = item.bid;
    const total = item.total;
    const submittedAt = addMinutes(now, -b.minutesAgo);
    insertBid.run(
      uuid(), rfqId, b.supplier.id,
      b.freight, b.origin, b.dest, total,
      b.transit, b.validity, idx + 1, submittedAt
    );
    insertLog.run(
      rfqId,
      "BID_SUBMITTED",
      `${b.supplier.name} submitted a bid of $${total.toFixed(2)}`
    );
    console.log(`  + Bid: ${b.supplier.name} -> $${total} (L${idx + 1})`);
  });
}

console.log("\nDone! Database seeded successfully.\n");
process.exit(0);