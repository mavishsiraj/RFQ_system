const STATUS_MAP = {
  ACTIVE: { label: "Active", cls: "badge-active" },
  CLOSED: { label: "Closed", cls: "badge-closed" },
  FORCE_CLOSED: { label: "Force Closed", cls: "badge-force-closed" },
  DRAFT: { label: "Draft", cls: "badge-draft" },
};

export default function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || { label: status, cls: "badge-closed" };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}
