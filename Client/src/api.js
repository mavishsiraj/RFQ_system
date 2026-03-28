const BASE = "/api";

async function request(url, options = {}) {
  const res = await fetch(`${BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getRfqs: () => request("/rfqs"),
  getRfq: (id) => request(`/rfqs/${id}`),
  createRfq: (data) => request("/rfqs", { method: "POST", body: JSON.stringify(data) }),
  submitBid: (rfqId, data) =>
    request(`/rfqs/${rfqId}/bids`, { method: "POST", body: JSON.stringify(data) }),
  getSuppliers: () => request("/suppliers"),
  createSupplier: (name) =>
    request("/suppliers", { method: "POST", body: JSON.stringify({ name }) }),
};