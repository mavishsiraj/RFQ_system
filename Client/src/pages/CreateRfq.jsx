import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { PlusCircle, AlertCircle } from "lucide-react";

function toLocalDatetimeStr(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export default function CreateRfq() {
  const navigate = useNavigate();

  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 60000);
  const in2h = new Date(now.getTime() + 2 * 3600000);
  const in4h = new Date(now.getTime() + 4 * 3600000);
  const in3d = new Date(now.getTime() + 3 * 86400000);

  const [form, setForm] = useState({
    name: "",
    reference_id: `RFQ-${Date.now().toString(36).toUpperCase()}`,
    bid_start_time: toLocalDatetimeStr(in30),
    bid_close_time: toLocalDatetimeStr(in2h),
    forced_close: toLocalDatetimeStr(in4h),
    pickup_date: toLocalDatetimeStr(in3d),
    trigger_window_mins: 10,
    extension_dur_mins: 5,
    extension_trigger: "BID_RECEIVED",
    max_extensions: 0,
    min_bid_decrement: 0,
  });

  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Client-side validation
    if (!form.name.trim()) {
      setError("RFQ Name is required");
      return;
    }

    const closeMs = new Date(form.bid_close_time).getTime();
    const forcedMs = new Date(form.forced_close).getTime();
    if (forcedMs <= closeMs) {
      setError("Forced Bid Close Time must be later than Bid Close Time");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        ...form,
        bid_start_time: new Date(form.bid_start_time).toISOString(),
        bid_close_time: new Date(form.bid_close_time).toISOString(),
        forced_close: new Date(form.forced_close).toISOString(),
        pickup_date: form.pickup_date ? new Date(form.pickup_date).toISOString() : null,
        trigger_window_mins: Number(form.trigger_window_mins),
        extension_dur_mins: Number(form.extension_dur_mins),
        max_extensions: Number(form.max_extensions),
        min_bid_decrement: Number(form.min_bid_decrement),
      };

      const rfq = await api.createRfq(payload);
      navigate(`/rfq/${rfq.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Create New RFQ</h1>
      <p className="text-sm text-gray-500 mb-6">
        Set up a British Auction with configurable extension rules.
      </p>

      <form onSubmit={handleSubmit} className="card p-6 space-y-6">
        <section>
          <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wider mb-3">
            Basic Information
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">RFQ Name</label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="e.g. Shanghai → Mumbai Container Freight"
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">Reference ID</label>
              <input
                type="text"
                name="reference_id"
                value={form.reference_id}
                onChange={handleChange}
                className="input font-mono"
                required
              />
            </div>
            <div>
              <label className="label">Pickup / Service Date</label>
              <input
                type="datetime-local"
                name="pickup_date"
                value={form.pickup_date}
                onChange={handleChange}
                className="input"
              />
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wider mb-3">
            Auction Timing
          </h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Bid Start Time</label>
              <input
                type="datetime-local"
                name="bid_start_time"
                value={form.bid_start_time}
                onChange={handleChange}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">Bid Close Time</label>
              <input
                type="datetime-local"
                name="bid_close_time"
                value={form.bid_close_time}
                onChange={handleChange}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">
                Forced Close Time
                <span className="text-red-500 ml-0.5">*</span>
              </label>
              <input
                type="datetime-local"
                name="forced_close"
                value={form.forced_close}
                onChange={handleChange}
                className="input"
                required
              />
              <p className="text-xs text-gray-400 mt-1">Must be after Bid Close Time</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wider mb-3">
            British Auction Configuration
          </h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Trigger Window (X min)</label>
              <input
                type="number"
                name="trigger_window_mins"
                value={form.trigger_window_mins}
                onChange={handleChange}
                min="1"
                max="60"
                className="input"
                required
              />
              <p className="text-xs text-gray-400 mt-1">
                Monitor activity in last X min before close
              </p>
            </div>
            <div>
              <label className="label">Extension Duration (Y min)</label>
              <input
                type="number"
                name="extension_dur_mins"
                value={form.extension_dur_mins}
                onChange={handleChange}
                min="1"
                max="30"
                className="input"
                required
              />
              <p className="text-xs text-gray-400 mt-1">
                Extra time added on trigger
              </p>
            </div>
            <div>
              <label className="label">Extension Trigger</label>
              <select
                name="extension_trigger"
                value={form.extension_trigger}
                onChange={handleChange}
                className="input"
              >
                <option value="BID_RECEIVED">Any Bid Received</option>
                <option value="RANK_CHANGE">Any Rank Change</option>
                <option value="L1_CHANGE">L1 (Lowest Bidder) Change</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                What triggers a time extension
              </p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="label">Max Extensions (0 = unlimited)</label>
              <input
                type="number"
                name="max_extensions"
                value={form.max_extensions}
                onChange={handleChange}
                min="0"
                max="100"
                className="input"
              />
              <p className="text-xs text-gray-400 mt-1">
                Limit how many times auction can extend
              </p>
            </div>
            <div>
              <label className="label">Min Bid Decrement ($)</label>
              <input
                type="number"
                name="min_bid_decrement"
                value={form.min_bid_decrement}
                onChange={handleChange}
                min="0"
                step="0.01"
                className="input"
              />
              <p className="text-xs text-gray-400 mt-1">
                Minimum improvement required per bid (0 = any improvement)
              </p>
            </div>
          </div>
        </section>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          <PlusCircle className="w-4 h-4" />
          {submitting ? "Creating..." : "Create RFQ with British Auction"}
        </button>
      </form>
    </div>
  );
}
