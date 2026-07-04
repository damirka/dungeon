export function pct(value?: number, digits = 1) {
  if (typeof value !== "number") {
    return "-";
  }
  return `${(value * 100).toFixed(digits)}%`;
}

export function numberValue(value?: number, digits = 1) {
  if (typeof value !== "number") {
    return "-";
  }
  return value.toFixed(value % 1 === 0 ? 0 : digits);
}

export function humanizeId(value: string) {
  return value.replace(/_/g, " ");
}
