export function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function defaultPeriodMonths(months: number) {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - months);
  return { start: toISODate(start), end: toISODate(end) };
}
