import { v4 as uuid } from "uuid";
import db from "../config/db.js";

export function listSuppliers(req, res) {
  const suppliers = db.prepare(`SELECT * FROM suppliers ORDER BY name`).all();
  res.json(suppliers);
}

export function createSupplier(req, res) {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name is required" });

  const trimmed = name.trim();
  const existing = db.prepare(`SELECT id FROM suppliers WHERE name = ?`).get(trimmed);
  if (existing) {
    return res.status(400).json({ error: `Supplier "${trimmed}" already exists` });
  }

  const id = uuid();
  db.prepare(`INSERT INTO suppliers (id, name) VALUES (?, ?)`).run(id, trimmed);
  res.status(201).json({ id, name: trimmed });
}