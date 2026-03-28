import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import socket from "../socket";
import StatusBadge from "../components/StatusBadge";
import Countdown from "../components/Countdown";
import { Clock, DollarSign, Users, ArrowRight, RefreshCw } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

export default function AuctionList() {
  const [rfqs, setRfqs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getRfqs();
      setRfqs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();

    socket.on("rfq:created", () => load());
    socket.on("rfq:updated", () => load());

    return () => {
      socket.off("rfq:created");
      socket.off("rfq:updated");
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">British Auctions</h1>
          <p className="text-sm text-gray-500 mt-1">
            {rfqs.length} auction{rfqs.length !== 1 ? "s" : ""} total
          </p>
        </div>
        <button onClick={load} className="btn-secondary">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {rfqs.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-gray-500 mb-4">No auctions yet.</p>
          <Link to="/create" className="btn-primary">Create your first RFQ</Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {rfqs.map((rfq) => (
            <Link
              key={rfq.id}
              to={`/rfq/${rfq.id}`}
              className="card p-5 hover:border-brand-300 hover:shadow-md transition-all group"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-gray-400">{rfq.reference_id}</span>
                    <StatusBadge status={rfq.status} />
                  </div>
                  <h3 className="font-semibold text-gray-900 truncate">{rfq.name}</h3>
                  <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5" />
                      {rfq.lowest_bid != null
                        ? `$${Number(rfq.lowest_bid).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                        : "No bids"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {rfq.bid_count} supplier{rfq.bid_count !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {rfq.status === "ACTIVE" ? (
                        <Countdown target={rfq.bid_close_time} />
                      ) : (
                        `Closed ${formatDistanceToNow(new Date(rfq.bid_close_time), { addSuffix: true })}`
                      )}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-gray-400">Forced Close</p>
                    <p className="font-medium text-gray-600">
                      {format(new Date(rfq.forced_close), "MMM d, h:mm a")}
                    </p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-brand-500 transition-colors" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
