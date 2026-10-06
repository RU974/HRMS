export const INVENTORY_CSV_HEADERS = ["name", "sku", "category", "quantity", "unit_cost", "location", "condition", "description"] as const;

/** Prefix cells that spreadsheets would execute as formulas (CSV injection). */
export function safeCsvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF/LF, embedded newlines. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell); cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }

  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Converts parsed CSV into objects keyed by the header row (case-insensitive). */
export function csvToInventoryRows(input: string): Record<string, string>[] {
  const [header, ...body] = parseCsv(input);
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  if (!keys.includes("name")) throw new Error('CSV must have a "name" column.');
  return body.map((cells) => {
    const obj: Record<string, string> = {};
    keys.forEach((k, idx) => {
      if ((INVENTORY_CSV_HEADERS as readonly string[]).includes(k)) obj[k] = (cells[idx] ?? "").trim();
    });
    return obj;
  });
}
