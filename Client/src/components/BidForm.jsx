import { useState, useEffect } from "react";
import { api } from "../api";
import { Send, AlertCircle, CheckCircle2 } from "lucide-react";

export default function BidForm({ rfqId, onBidSubmitted }) {
  const [suppliers, setSuppliers] = useState([]);
  const [addingNew, setAddingNew] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [form, setForm] = useState({
    supplier_id: "",
    freight_charges: "",
    origin_charges: "",
    destination_charges: "",
    transit_time_days: "",
    quote_validity: "30 days",
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getSuppliers().then(setSuppliers).catch(console.error);
  }, []);

  const total =
    (Number(form.freight_charges) || 0) +
    (Number(form.origin_charges) || 0) +
    (Number(form.destination_charges) || 0);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
    setResult(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.supplier_id) {
      setError("Please select a supplier");
      return;
    }
    if (total <= 0) {
      setError("Total price must be greater than zero");
      return;
    }

    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const res = await api.submitBid(rfqId, {
        supplier_id: form.supplier_id,
        freight_charges: Number(form.freight_charges) || 0,
        origin_charges: Number(form.origin_charges) || 0,
        destination_charges: Number(form.destination_charges) || 0,
        transit_time_days: Number(form.transit_time_days) || null,
        quote_validity: form.quote_validity || null,
      });

      setResult(res);
      setForm((prev) => ({
        ...prev,
        freight_charges: "",
        origin_charges: "",
        destination_charges: "",
        transit_time_days: "",
      }));
      onBidSubmitted?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card p-5">
      <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Send className="w-4 h-4 text-brand-500" /> Submit a Bid
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label mb-0">Carrier / Supplier</label>
            <button
              type="button"
              onClick={() => { setAddingNew(!addingNew); setError(null); }}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              {addingNew ? "Pick existing" : "+ Add new"}
            </button>
          </div>
          {addingNew ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={newSupplierName}
                onChange={(e) => { setNewSupplierName(e.target.value); setError(null); }}
                placeholder="New supplier name..."
                className="input flex-1"
              />
              <button
                type="button"
                disabled={!newSupplierName.trim()}
                onClick={async () => {
                  try {
                    const s = await api.createSupplier(newSupplierName.trim());
                    setSuppliers((prev) => [...prev, s]);
                    setForm((prev) => ({ ...prev, supplier_id: s.id }));
                    setNewSupplierName("");
                    setAddingNew(false);
                  } catch (err) { setError(err.message); }
                }}
                className="btn-secondary text-xs px-3"
              >
                Add
              </button>
            </div>
          ) : (
            <select
              name="supplier_id"
              value={form.supplier_id}
              onChange={handleChange}
              className="input"
            >
              <option value="">Select a supplier...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Freight Charges ($)</label>
            <input
              type="number"
              name="freight_charges"
              value={form.freight_charges}
              onChange={handleChange}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="input"
            />
          </div>
          <div>
            <label className="label">Origin Charges ($)</label>
            <input
              type="number"
              name="origin_charges"
              value={form.origin_charges}
              onChange={handleChange}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="input"
            />
          </div>
          <div>
            <label className="label">Destination Charges ($)</label>
            <input
              type="number"
              name="destination_charges"
              value={form.destination_charges}
              onChange={handleChange}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="input"
            />
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm text-gray-600">Total Bid Price</span>
          <span className="text-lg font-bold text-gray-900">
            ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Transit Time (days)</label>
            <input
              type="number"
              name="transit_time_days"
              value={form.transit_time_days}
              onChange={handleChange}
              placeholder="e.g. 14"
              min="1"
              className="input"
            />
          </div>
          <div>
            <label className="label">Quote Validity</label>
            <select
              name="quote_validity"
              value={form.quote_validity}
              onChange={handleChange}
              className="input"
            >
              <option value="15 days">15 days</option>
              <option value="30 days">30 days</option>
              <option value="45 days">45 days</option>
              <option value="60 days">60 days</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}
        {result && (
          <div className="bg-emerald-50 rounded-lg p-3 space-y-1">
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="w-4 h-4" /> Bid submitted successfully!
            </p>
            {result.auction?.extended && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1">
                Auction extended! Reason: {result.auction.reason}
              </p>
            )}
          </div>
        )}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          <Send className="w-4 h-4" />
          {submitting ? "Submitting..." : "Submit Bid"}
        </button>
      </form>
    </div>
  );
}
