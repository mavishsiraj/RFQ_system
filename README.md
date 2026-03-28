# RFQ System — British Auction

A full-stack RFQ (Request for Quotation) system built with React + Vite on the frontend and Node.js + Express on the backend. Suppliers compete in real time by lowering their prices, with the auction engine automatically extending deadlines when late bids come in.

Built for a take-home assignment. The focus was on getting the auction logic right — auto-extensions, ranking, bid validation, and real-time updates — rather than bolting on features that weren't asked for.

---

## What it does

- **Create RFQ auctions** with configurable British Auction rules
- **Real-time bidding** via Socket.IO — no page refresh needed
- **Auto-extension logic** — if a bid comes in close to closing time, the auction extends automatically based on your config:
  - Trigger window (how close to close time counts as "late")
  - Extension duration (how many minutes to add)
  - Trigger type: `BID_RECEIVED`, `RANK_CHANGE`, or `L1_CHANGE`
  - Max extensions (so it can't go on forever)
- **Forced close time** — hard deadline, extensions can never go past this
- **Bid validation** — no negative charges, minimum decrement enforced, only active auctions accept bids
- **Auction list** — shows lowest bid and supplier count at a glance
- **Auction detail view** — live supplier rankings (L1, L2, L3...), full bid history, and an activity log showing every extension with its reason

---
## Why no auth?

Auth wasn't in the requirements, so I didn't add it. The goal was to build the auction engine well — config-driven rules, extension logic, ranking, edge cases — and that's where the time went.

If I were adding it: JWT tokens issued on login, with the user's ID and role (buyer or supplier) baked in. A middleware would verify the token on every request. Buyers can create RFQs but not bid; suppliers can bid but not create. Socket.IO connections would verify the token on handshake too.

Scoping it out was a deliberate call, not an oversight.

---
## Repo structure

```
RFQ_system/
├── Client/               # React frontend (Vite)
│   └── src/
│       ├── pages/        # AuctionList, AuctionDetail, CreateRfq
│       ├── api.js        # fetch wrapper for all REST calls
│       └── socket.js     # Socket.IO client with reconnect
│
└── Server/               # Node.js + Express backend
    ├── index.js          # API routes + Socket.IO events
    ├── db.js             # SQLite helpers (better-sqlite3)
    ├── auctionEngine.js  # Core auction logic (ranking, extensions, validation)
    └── seed.js           # Optional: seed test data
```

---

## Running locally

### Prerequisites
- Node.js 18+ (or latest LTS)
- npm

### 1. Install dependencies

```bash
# Backend
cd Server
npm install

# Frontend
cd ../Client
npm install
```

### 2. (Optional) Seed test data

```bash
cd Server
npm run seed
```

This creates a few sample RFQs and suppliers so you have something to look at immediately.

### 3. Start the backend

```bash
cd Server
npm run dev
```

Server runs on `http://localhost:3000`

### 4. Start the frontend

```bash
cd Client
npm run dev
```

Frontend runs on `http://localhost:5173` — open this in your browser.

---

## API reference

| Method | Endpoint | What it does |
|--------|----------|--------------|
| GET | `/api/health` | Health check — returns `{ status: "ok", uptime }` |
| GET | `/api/rfqs` | All auctions with lowest bid + bid count |
| GET | `/api/rfqs/:id` | Single auction — RFQ details, all bids, activity log |
| POST | `/api/rfqs` | Create a new RFQ auction |
| POST | `/api/rfqs/:id/bids` | Submit a bid on an active auction |
| GET | `/api/suppliers` | List all suppliers |
| POST | `/api/suppliers` | Add a supplier |

### Creating an RFQ — required fields

```json
{
  "name": "Freight Q3",
  "reference_id": "RFQ-001",
  "bid_start_time": "2025-07-01T10:00:00Z",
  "bid_close_time": "2025-07-01T18:00:00Z",
  "forced_close": "2025-07-01T19:00:00Z"
}
```

Optional fields (all have sensible defaults):
`pickup_date`, `trigger_window_mins`, `extension_dur_mins`, `extension_trigger`, `max_extensions`, `min_bid_decrement`

### Submitting a bid — required fields

```json
{
  "supplier_id": 1
}
```

Optional: `freight_charges`, `origin_charges`, `destination_charges`, `transit_time_days`, `quote_validity`

---

## Real-time events (Socket.IO)

| Event | Scope | Fired when |
|-------|-------|------------|
| `rfq:created` | All clients | A new RFQ is created |
| `rfq:updated` | All clients | Any auction status changes |
| `auction:update` | Room (per RFQ) | A bid is placed or auction extends |

Join a room with `auction:join(rfqId)` to get per-auction updates.

---

## Live demo

> **Note:** The backend is hosted on Render's free tier. If it hasn't been used in a while, the first request may take ~20–30 seconds to wake up. That's normal — just wait a moment and refresh.

- Frontend: `https://rfqs.netlify.app/`
- Backend: `https://rfq-system-fk8t.onrender.com`

---

## Things I'd add next

- JWT auth with buyer/supplier roles (see note above)
- Pagination and filtering on the auction list
- Per-supplier quantity limits
- Email/SMS notifications on extension or close
- Unit tests for the auction engine, integration tests for the API routes
- PostgreSQL + Redis for production scale (SQLite resets on Render redeploy)