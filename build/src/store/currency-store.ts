import { create } from "zustand";

export const CURRENCY_OPTIONS = [
  { code: "PKR", symbol: "Rs",  label: "PKR – Pakistani Rupee",  rateFromPKR: 1 },
  { code: "USD", symbol: "$",   label: "USD – US Dollar",        rateFromPKR: 1 / 278 },
  { code: "EUR", symbol: "€",   label: "EUR – Euro",             rateFromPKR: 1 / 302 },
  { code: "GBP", symbol: "£",   label: "GBP – British Pound",    rateFromPKR: 1 / 354 },
  { code: "SAR", symbol: "﷼",   label: "SAR – Saudi Riyal",      rateFromPKR: 1 / 74 },
  { code: "AED", symbol: "د.إ", label: "AED – UAE Dirham",       rateFromPKR: 1 / 75.7 },
  { code: "INR", symbol: "₹",   label: "INR – Indian Rupee",     rateFromPKR: 1 / 3.35 },
] as const;

export type CurrencyCode = (typeof CURRENCY_OPTIONS)[number]["code"];

const STORAGE_KEY = "hrms-currency";

function getInitialCurrency(): CurrencyCode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return CURRENCY_OPTIONS.some((c) => c.code === stored)
    ? (stored as CurrencyCode)
    : "PKR";
}

interface CurrencyState {
  currency: CurrencyCode;
  setCurrency: (code: CurrencyCode) => void;
  /** Convert a PKR amount to the selected currency */
  convertFromPKR: (pkrAmount: number) => number;
  /** Format a PKR amount as a string in the selected currency */
  formatAmount: (pkrAmount: number) => string;
}

export const useCurrencyStore = create<CurrencyState>((set, get) => ({
  currency: getInitialCurrency(),

  setCurrency: (code) => {
    localStorage.setItem(STORAGE_KEY, code);
    set({ currency: code });
  },

  convertFromPKR: (pkrAmount) => {
    const { currency } = get();
    const opt = CURRENCY_OPTIONS.find((c) => c.code === currency);
    if (!opt) return pkrAmount;
    return pkrAmount * opt.rateFromPKR;
  },

  formatAmount: (pkrAmount) => {
    const { currency, convertFromPKR } = get();
    const opt = CURRENCY_OPTIONS.find((c) => c.code === currency);
    const converted = convertFromPKR(pkrAmount);
    const formatted = new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }).format(converted);
    return `${opt?.symbol ?? currency} ${formatted}`;
  },
}));
