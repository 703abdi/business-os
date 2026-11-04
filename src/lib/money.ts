export const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;

export const safeDiv = (a: number, b: number) => (b ? a / b : 0);
