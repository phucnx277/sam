import { create } from "zustand";

const LS_CURRENCY_KEY = "sam.currency";
const DEFAULT_CURRENCY = "💰";
const MAX_CURRENCY_LENGTH = 3;

const normalize = (value: string): string =>
  Array.from(value.trim()).slice(0, MAX_CURRENCY_LENGTH).join("");

const getInitialCurrency = (): string => {
  const stored = localStorage.getItem(LS_CURRENCY_KEY);
  return stored === null ? DEFAULT_CURRENCY : normalize(stored);
};

const currencyStore = create<{
  currency: string;
  setCurrency: (value: string) => void;
}>((set) => ({
  currency: getInitialCurrency(),
  setCurrency: (value: string) => {
    const currency = normalize(value);
    localStorage.setItem(LS_CURRENCY_KEY, currency);
    set({ currency });
  },
}));

export default currencyStore;
