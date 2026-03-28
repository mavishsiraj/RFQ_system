import db from "./db.js";

export function getLatestBidsRanked(rfqId) {
  const rows = db
    .prepare(
      `SELECT b.*
       FROM bids b
       INNER JOIN (
         SELECT supplier_id, MIN(total_price) as min_price
         FROM bids WHERE rfq_id = ? GROUP BY supplier_id
       ) best ON b.supplier_id = best.supplier_id
                AND b.total_price = best.min_price
                AND b.rfq_id = ?
       GROUP BY b.supplier_id
       ORDER BY b.total_price ASC`
    )
    .all(rfqId, rfqId);

  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

export function getSupplierBestBid(rfqId, supplierId) {
  return db
    .prepare(
      `SELECT MIN(total_price) as best_price
       FROM bids WHERE rfq_id = ? AND supplier_id = ?`
    )
    .get(rfqId, supplierId);
}

export function recomputeRanks(rfqId, previousRanked) {
  const ranked = getLatestBidsRanked(rfqId);
  const currentL1 = ranked.length > 0 ? ranked[0].supplier_id : null;

  const previousL1 = previousRanked.length > 0
    ? previousRanked[0].supplier_id
    : null;

  const oldRankMap = {};
  for (const b of previousRanked) {
    oldRankMap[b.supplier_id] = b.rank;
  }

  let ranksChanged = false;
  for (const b of ranked) {
    if (oldRankMap[b.supplier_id] !== b.rank) {
      ranksChanged = true;
      break;
    }
  }
  if (ranked.length !== previousRanked.length) {
    ranksChanged = true;
  }

  const updateRank = db.prepare(`UPDATE bids SET rank = ? WHERE id = ?`);
  const batchUpdate = db.transaction((items) => {
    for (const item of items) {
      updateRank.run(item.rank, item.id);
    }
  });
  batchUpdate(ranked);

  return { previousL1, currentL1, ranked, ranksChanged };
}

function isInTriggerWindow(rfq, nowMs) {
  const closeMs = new Date(rfq.bid_close_time).getTime();
  const windowStart = closeMs - rfq.trigger_window_mins * 60 * 1000;
  return nowMs >= windowStart && nowMs <= closeMs;
}

function extendAuction(rfq, reason) {
  const currentClose = new Date(rfq.bid_close_time).getTime();
  const forcedClose = new Date(rfq.forced_close).getTime();

  if (currentClose >= forcedClose) {
    return null;
  }

  if (rfq.max_extensions > 0 && rfq.extension_count >= rfq.max_extensions) {
    db.prepare(
      `INSERT INTO activity_log (rfq_id, event_type, description, metadata)
       VALUES (?, 'EXTENSION_DENIED', ?, ?)`
    ).run(
      rfq.id,
      `Extension denied: max ${rfq.max_extensions} extensions reached`,
      JSON.stringify({ extension_count: rfq.extension_count, max: rfq.max_extensions })
    );
    return null;
  }

  const extensionMs = rfq.extension_dur_mins * 60 * 1000;
  let newClose = Math.min(currentClose + extensionMs, forcedClose);
  const newCloseISO = new Date(newClose).toISOString();
  const newCount = rfq.extension_count + 1;

  db.prepare(
    `UPDATE rfqs SET bid_close_time = ?, extension_count = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(newCloseISO, newCount, rfq.id);

  db.prepare(
    `INSERT INTO activity_log (rfq_id, event_type, description, metadata)
     VALUES (?, 'TIME_EXTENDED', ?, ?)`
  ).run(
    rfq.id,
    `Auction extended by ${rfq.extension_dur_mins} min (extension #${newCount}). Reason: ${reason}`,
    JSON.stringify({
      previous_close: rfq.bid_close_time,
      new_close: newCloseISO,
      reason,
      extension_mins: rfq.extension_dur_mins,
      extension_number: newCount,
      max_extensions: rfq.max_extensions || "unlimited",
    })
  );

  return newCloseISO;
}

export function processBid(rfqId, previousRanked) {
  const rfq = db.prepare(`SELECT * FROM rfqs WHERE id = ?`).get(rfqId);
  if (!rfq) throw new Error("RFQ not found");

  const now = Date.now();
  const startMs = new Date(rfq.bid_start_time).getTime();
  const closeMs = new Date(rfq.bid_close_time).getTime();
  const forcedMs = new Date(rfq.forced_close).getTime();

  if (now < startMs) throw new Error("Auction has not started yet");
  if (now > forcedMs) throw new Error("Auction is force-closed");
  if (now > closeMs) throw new Error("Auction bidding period has ended");

  
  const { previousL1, currentL1, ranked, ranksChanged } =
    recomputeRanks(rfqId, previousRanked);

  let extended = false;
  let newCloseTime = null;
  let reason = null;

  if (isInTriggerWindow(rfq, now)) {
    const trigger = rfq.extension_trigger;

    if (trigger === "BID_RECEIVED") {
      reason = "New bid received during trigger window";
      newCloseTime = extendAuction(rfq, reason);
      extended = !!newCloseTime;

    } else if (trigger === "RANK_CHANGE") {
      
      if (ranksChanged) {
        reason = "Supplier rank changed during trigger window";
        newCloseTime = extendAuction(rfq, reason);
        extended = !!newCloseTime;
      }

    } else if (trigger === "L1_CHANGE") {
      if (previousL1 !== currentL1) {
        reason = "Lowest bidder (L1) changed during trigger window";
        newCloseTime = extendAuction(rfq, reason);
        extended = !!newCloseTime;
      }
    }
  }

  if (ranksChanged && ranked.length > 1) {
    const l1Name = db.prepare(`SELECT name FROM suppliers WHERE id = ?`)
      .get(ranked[0].supplier_id)?.name || "Unknown";
    db.prepare(
      `INSERT INTO activity_log (rfq_id, event_type, description, metadata)
       VALUES (?, 'RANK_CHANGE', ?, ?)`
    ).run(
      rfqId,
      `Rankings updated. Current L1: ${l1Name} at $${ranked[0].total_price.toFixed(2)}`,
      JSON.stringify({ rankings: ranked.map(r => ({ supplier_id: r.supplier_id, rank: r.rank, total: r.total_price })) })
    );
  }

  return { ranked, extended, newCloseTime, reason };
}



export function validateBidImprovement(rfqId, supplierId, newTotal) {
  const rfq = db.prepare(`SELECT min_bid_decrement FROM rfqs WHERE id = ?`).get(rfqId);
  const existing = getSupplierBestBid(rfqId, supplierId);

  if (!existing || existing.best_price === null) {
    return { valid: true };
  }

  const currentBest = existing.best_price;

  if (newTotal >= currentBest) {
    return {
      valid: false,
      error: `New bid ($${newTotal.toFixed(2)}) must be lower than your current best ($${currentBest.toFixed(2)})`
    };
  }

  if (rfq && rfq.min_bid_decrement > 0) {
    const decrement = currentBest - newTotal;
    if (decrement < rfq.min_bid_decrement) {
      return {
        valid: false,
        error: `Bid must be at least $${rfq.min_bid_decrement.toFixed(2)} lower than your current best ($${currentBest.toFixed(2)}). Your reduction: $${decrement.toFixed(2)}`
      };
    }
  }

  return { valid: true };
}



export function updateAuctionStatuses() {
  const now = new Date().toISOString();
  const closedIds = [];

  const forceClosable = db
    .prepare(`SELECT id FROM rfqs WHERE status = 'ACTIVE' AND forced_close <= ?`)
    .all(now);

  for (const { id } of forceClosable) {
    db.prepare(
      `UPDATE rfqs SET status = 'FORCE_CLOSED', updated_at = datetime('now') WHERE id = ?`
    ).run(id);
    db.prepare(
      `INSERT INTO activity_log (rfq_id, event_type, description)
       VALUES (?, 'AUCTION_FORCE_CLOSED', 'Auction reached forced close time')`
    ).run(id);
    closedIds.push(id);
  }

  
  const closable = db
    .prepare(
      `SELECT id FROM rfqs WHERE status = 'ACTIVE' AND bid_close_time <= ? AND forced_close > ?`
    )
    .all(now, now);

  for (const { id } of closable) {
    db.prepare(
      `UPDATE rfqs SET status = 'CLOSED', updated_at = datetime('now') WHERE id = ?`
    ).run(id);
    db.prepare(
      `INSERT INTO activity_log (rfq_id, event_type, description)
       VALUES (?, 'AUCTION_CLOSED', 'Auction closed at bid close time')`
    ).run(id);
    closedIds.push(id);
  }

  db.prepare(
    `UPDATE rfqs SET status = 'ACTIVE', updated_at = datetime('now')
     WHERE status = 'DRAFT' AND bid_start_time <= ?`
  ).run(now);

  return closedIds;
}