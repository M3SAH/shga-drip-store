export const DISCOUNT_RATE = 0.10;

export function applyDiscount(price, discountEnabled) {
  const base = Number(price) || 0;
  if (!discountEnabled) return base;
  return base - base * DISCOUNT_RATE;
}

export function formatPrice(price) {
  const base = Number(price) || 0;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
  }).format(base);
}

