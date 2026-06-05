export const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatMonthYear(month: number, year: number) {
  return `${monthNames[Math.max(0, Math.min(11, month - 1))]} ${year}`;
}

export function downloadCsv(filename: string, headers: Array<string>, rows: Array<Array<string | number | boolean | null | undefined>>) {
  const escapeCell = (value: string | number | boolean | null | undefined) => {
    const text = value == null ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };

  const csv = [headers, ...rows].map((row) => row.map((cell) => escapeCell(cell)).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
