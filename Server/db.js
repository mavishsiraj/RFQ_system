import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const db = new Database(path.join(__dirname, "auction.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS rfqs (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    reference_id    TEXT NOT NULL UNIQUE,
    bid_start_time  TEXT NOT NULL,
    bid_close_time  TEXT NOT NULL,
    original_close  TEXT NOT NULL,
    forced_close    TEXT NOT NULL,
    pickup_date     TEXT,
    status          TEXT NOT NULL DEFAULT 'DRAFT'
                    CHECK(status IN ('DRAFT','ACTIVE','CLOSED','FORCE_CLOSED')),
    trigger_window_mins   INTEGER NOT NULL DEFAULT 10 CHECK(trigger_window_mins > 0),
    extension_dur_mins    INTEGER NOT NULL DEFAULT 5  CHECK(extension_dur_mins > 0),
    extension_trigger     TEXT NOT NULL DEFAULT 'BID_RECEIVED'
                    CHECK(extension_trigger IN ('BID_RECEIVED','RANK_CHANGE','L1_CHANGE')),
    max_extensions        INTEGER NOT NULL DEFAULT 0  CHECK(max_extensions >= 0),
    extension_count       INTEGER NOT NULL DEFAULT 0  CHECK(extension_count >= 0),
    min_bid_decrement     REAL NOT NULL DEFAULT 0     CHECK(min_bid_decrement >= 0),
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id    TEXT PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS bids (
    id                  TEXT PRIMARY KEY,
    rfq_id              TEXT NOT NULL REFERENCES rfqs(id),
    supplier_id         TEXT NOT NULL REFERENCES suppliers(id),
    freight_charges     REAL NOT NULL DEFAULT 0,
    origin_charges      REAL NOT NULL DEFAULT 0,
    destination_charges REAL NOT NULL DEFAULT 0,
    total_price         REAL NOT NULL,
    transit_time_days   INTEGER,
    quote_validity      TEXT,
    rank                INTEGER,
    submitted_at        TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(rfq_id, supplier_id, submitted_at)
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    rfq_id      TEXT NOT NULL REFERENCES rfqs(id),
    event_type  TEXT NOT NULL,
    description TEXT NOT NULL,
    metadata    TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_bids_rfq    ON bids(rfq_id);
  CREATE INDEX IF NOT EXISTS idx_bids_total   ON bids(rfq_id, total_price);
  CREATE INDEX IF NOT EXISTS idx_bids_supplier ON bids(rfq_id, supplier_id);
  CREATE INDEX IF NOT EXISTS idx_log_rfq     ON activity_log(rfq_id);
  CREATE INDEX IF NOT EXISTS idx_rfqs_status  ON rfqs(status);
`);

export default db;