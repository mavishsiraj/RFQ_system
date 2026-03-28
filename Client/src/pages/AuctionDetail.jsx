import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api";
import socket from "../socket";
import StatusBadge from "../components/StatusBadge";
import Countdown from "../components/Countdown";
import BidForm from "../components/BidForm";
import {
  ArrowLeft,
  Clock,
  Shield,
  Settings2,
  Trophy,
  Activity,
  AlertTriangle,
  Timer,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";

const TRIGGER_LABELS = {
  BID_RECEIVED: "Any bid received in trigger window",
  RANK_CHANGE: "Any supplier rank change in trigger window",
  L1_CHANGE: "Lowest bidder (L1) change in trigger window",
};

const EVENT_ICONS = {
  BID_SUBMITTED: "bg-blue-100 text-blue-600",
  TIME_EXTENDED: "bg-amber-100 text-amber-600",
  AUCTION_CLOSED: "bg-gray-100 text-gray-600",
  AUCTION_FORCE_CLOSED: "bg-red-100 text-red-600",
  RFQ_CREATED: "bg-emerald-100 text-emerald-600",
  RANK_CHANGE: "bg-purple-100 text-purple-600",
  EXTENSION_DENIED: "bg-orange-100 text-orange-600",
};

export default function AuctionDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [flashExtend, setFlashExtend] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.getRfq(id);
      setData(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();

    socket.emit("auction:join", id);

    const handleUpdate = (payload) => {
      if (payload.rfqId === id) {
        if (payload.extended) {
          setFlashExtend(true);
          setTimeout(() => setFlashExtend(false), 3000);
        }
        load();
      }
    };

    const handleClosed = (rfq) => {
      if (rfq.id === id) load();
    };

    socket.on("auction:update", handleUpdate);
    socket.on("auction:closed", handleClosed);

    return () => {
      socket.emit("auction:leave", id);
      socket.off("auction:update", handleUpdate);
      socket.off("auction:closed", handleClosed);
    };
  }, [id, load]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-brand-500" />
      </div>
    );
  }

  const { rfq, bids, activity_log } = data;

  return (
    <div className="space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Auctions
      </Link>

      {flashExtend && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3 animate-pulse">
          <Timer className="w-5 h-5 text-amber-600" />
          <p className="text-sm font-medium text-amber-800">
            Auction time has been extended! New close time updated.
          </p>
        </div>
      )}

      <div className="card p-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-gray-400">{rfq.reference_id}</span>
              <StatusBadge status={rfq.status} />
            </div>
            <h1 className="text-xl font-bold text-gray-900">{rfq.name}</h1>
          </div>

          {rfq.status === "ACTIVE" && (
            <div className="flex items-center gap-6 text-sm">
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-0.5">Closes in</p>
                <p className="text-lg font-bold text-brand-700">
                  <Countdown target={rfq.bid_close_time} />
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-0.5">Forced Close</p>
                <p className="font-semibold text-gray-600">
                  <Countdown target={rfq.forced_close} />
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Time details row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-gray-100">
          <TimeBox label="Bid Start" time={rfq.bid_start_time} icon={Clock} />
          <TimeBox label="Current Close" time={rfq.bid_close_time} icon={Clock} highlight />
          <TimeBox label="Original Close" time={rfq.original_close} icon={Clock} />
          <TimeBox label="Forced Close" time={rfq.forced_close} icon={Shield} danger />
        </div>
      </div>

      <div className="card">
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <span className="flex items-center gap-2 font-semibold text-gray-700">
            <Settings2 className="w-4 h-4" /> Auction Configuration
          </span>
          {showConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showConfig && (
          <div className="px-4 pb-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <ConfigCard
              label="Trigger Window (X)"
              value={`${rfq.trigger_window_mins} minutes`}
              desc="Monitor bidding activity in the last X minutes before close"
            />
            <ConfigCard
              label="Extension Duration (Y)"
              value={`${rfq.extension_dur_mins} minutes`}
              desc="Extra time added when trigger fires"
            />
            <ConfigCard
              label="Extension Trigger"
              value={rfq.extension_trigger.replace(/_/g, " ")}
              desc={TRIGGER_LABELS[rfq.extension_trigger]}
            />
            <ConfigCard
              label="Max Extensions"
              value={rfq.max_extensions === 0 ? "Unlimited" : `${rfq.max_extensions} times`}
              desc={`Extensions used: ${rfq.extension_count || 0}${rfq.max_extensions > 0 ? ` / ${rfq.max_extensions}` : ""}`}
            />
            <ConfigCard
              label="Min Bid Decrement"
              value={rfq.min_bid_decrement > 0 ? `$${rfq.min_bid_decrement}` : "Any improvement"}
              desc="Minimum price reduction required per bid"
            />
          </div>
        )}
      </div>

      <AuctionStats bids={bids} rfq={rfq} activityLog={activity_log} />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              <h2 className="font-semibold text-gray-900">Supplier Rankings</h2>
              <span className="ml-auto text-xs text-gray-400">{bids.length} bid{bids.length !== 1 ? "s" : ""}</span>
            </div>
            {bids.length === 0 ? (
              <p className="p-6 text-center text-gray-400 text-sm">No bids submitted yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                      <th className="px-4 py-3">Rank</th>
                      <th className="px-4 py-3">Supplier</th>
                      <th className="px-4 py-3 text-right">Freight</th>
                      <th className="px-4 py-3 text-right">Origin</th>
                      <th className="px-4 py-3 text-right">Destination</th>
                      <th className="px-4 py-3 text-right font-bold">Total</th>
                      <th className="px-4 py-3 text-center">Transit</th>
                      <th className="px-4 py-3">Validity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {bids.map((b) => (
                      <tr
                        key={b.id}
                        className={`${b.rank === 1 ? "bg-emerald-50/50" : "hover:bg-gray-50"} transition-colors`}
                      >
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                              b.rank === 1
                                ? "bg-emerald-500 text-white"
                                : b.rank === 2
                                ? "bg-gray-200 text-gray-700"
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            L{b.rank}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{b.supplier_name}</td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          ${Number(b.freight_charges).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          ${Number(b.origin_charges).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          ${Number(b.destination_charges).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">
                          ${Number(b.total_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">
                          {b.transit_time_days ? `${b.transit_time_days}d` : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{b.quote_validity || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {rfq.status === "ACTIVE" && (
            <BidForm rfqId={rfq.id} onBidSubmitted={load} />
          )}
        </div>

        <div className="card overflow-hidden max-h-[700px] flex flex-col">
          <div className="p-4 border-b border-gray-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-brand-500" />
            <h2 className="font-semibold text-gray-900">Activity Log</h2>
          </div>
          <div className="overflow-y-auto flex-1 p-4 space-y-3">
            {activity_log.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No activity yet.</p>
            ) : (
              activity_log.map((log) => (
                <div key={log.id} className="flex gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      EVENT_ICONS[log.event_type] || "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {log.event_type === "TIME_EXTENDED" ? (
                      <Timer className="w-3.5 h-3.5" />
                    ) : log.event_type === "BID_SUBMITTED" ? (
                      <DollarIcon />
                    ) : log.event_type.includes("CLOSED") ? (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    ) : (
                      <Activity className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-700 leading-snug">{log.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {format(new Date(log.created_at), "MMM d, h:mm:ss a")}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


function TimeBox({ label, time, icon: Icon, highlight, danger }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-brand-50" : danger ? "bg-red-50" : "bg-gray-50"}`}>
      <p className="flex items-center gap-1 text-xs text-gray-500 mb-1">
        <Icon className="w-3 h-3" /> {label}
      </p>
      <p className={`text-sm font-semibold ${danger ? "text-red-700" : highlight ? "text-brand-700" : "text-gray-700"}`}>
        {format(new Date(time), "MMM d, h:mm a")}
      </p>
    </div>
  );
}

function ConfigCard({ label, value, desc }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="font-semibold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{desc}</p>
    </div>
  );
}

function AuctionStats({ bids, rfq, activityLog }) {
  if (bids.length === 0) return null;

  const uniqueSuppliers = new Set(bids.map((b) => b.supplier_id)).size;
  const highestBid = Math.max(...bids.map((b) => b.total_price));
  const lowestBid = Math.min(...bids.map((b) => b.total_price));
  const savings = highestBid > 0 ? (((highestBid - lowestBid) / highestBid) * 100).toFixed(1) : 0;
  const extensions = activityLog.filter((l) => l.event_type === "TIME_EXTENDED").length;
  const denied = activityLog.filter((l) => l.event_type === "EXTENSION_DENIED").length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
      <StatCard label="Total Bids" value={bids.length} color="blue" />
      <StatCard label="Suppliers" value={uniqueSuppliers} color="purple" />
      <StatCard label="Lowest Bid" value={`$${lowestBid.toLocaleString()}`} color="emerald" />
      <StatCard label="Price Spread" value={`${savings}%`} color="amber" />
      <StatCard label="Extensions" value={extensions} color="orange" />
      <StatCard
        label="Max Ext. Left"
        value={rfq.max_extensions === 0 ? "∞" : Math.max(0, rfq.max_extensions - (rfq.extension_count || 0))}
        color="gray"
      />
    </div>
  );
}

function StatCard({ label, value, color }) {
  const colors = {
    blue: "bg-blue-50 text-blue-700",
    purple: "bg-purple-50 text-purple-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    orange: "bg-orange-50 text-orange-700",
    gray: "bg-gray-50 text-gray-700",
  };
  return (
    <div className={`rounded-lg p-3 ${colors[color] || colors.gray}`}>
      <p className="text-xs opacity-70 mb-0.5">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function DollarIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
    </svg>
  );
}
