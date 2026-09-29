export interface Category {
  key: string;
  label: string;
  emoji: string;
  color: string;
}

export const CATEGORIES: Record<string, Category> = {
  groceries: { key: "groceries", label: "Продукти", emoji: "🛒", color: "#22c55e" },
  cafe: { key: "cafe", label: "Кафе і ресторани", emoji: "🍽️", color: "#f97316" },
  transport: { key: "transport", label: "Транспорт", emoji: "🚌", color: "#3b82f6" },
  fuel: { key: "fuel", label: "Паливо", emoji: "⛽", color: "#0ea5e9" },
  shopping: { key: "shopping", label: "Покупки", emoji: "🛍️", color: "#a855f7" },
  health: { key: "health", label: "Здоров'я", emoji: "💊", color: "#ef4444" },
  entertainment: { key: "entertainment", label: "Розваги", emoji: "🎬", color: "#ec4899" },
  utilities: { key: "utilities", label: "Комуналка і зв'язок", emoji: "💡", color: "#eab308" },
  travel: { key: "travel", label: "Подорожі", emoji: "✈️", color: "#14b8a6" },
  beauty: { key: "beauty", label: "Краса", emoji: "💅", color: "#d946ef" },
  education: { key: "education", label: "Освіта", emoji: "📚", color: "#6366f1" },
  transfers: { key: "transfers", label: "Перекази", emoji: "🔁", color: "#64748b" },
  atm: { key: "atm", label: "Готівка", emoji: "🏧", color: "#94a3b8" },
  income: { key: "income", label: "Надходження", emoji: "💰", color: "#10b981" },
  other: { key: "other", label: "Інше", emoji: "📦", color: "#9ca3af" },
};

const RANGES: { from: number; to: number; cat: string }[] = [
  { from: 5411, to: 5411, cat: "groceries" },
  { from: 5422, to: 5422, cat: "groceries" },
  { from: 5441, to: 5441, cat: "groceries" },
  { from: 5451, to: 5451, cat: "groceries" },
  { from: 5462, to: 5462, cat: "groceries" },
  { from: 5499, to: 5499, cat: "groceries" },
  { from: 5811, to: 5814, cat: "cafe" },
  { from: 5812, to: 5813, cat: "cafe" },
  { from: 5541, to: 5542, cat: "fuel" },
  { from: 4111, to: 4131, cat: "transport" },
  { from: 4121, to: 4121, cat: "transport" },
  { from: 7523, to: 7523, cat: "transport" },
  { from: 4011, to: 4011, cat: "transport" },
  { from: 5812, to: 5814, cat: "cafe" },
  { from: 5912, to: 5912, cat: "health" },
  { from: 8011, to: 8099, cat: "health" },
  { from: 5641, to: 5651, cat: "shopping" },
  { from: 5611, to: 5699, cat: "shopping" },
  { from: 5300, to: 5399, cat: "shopping" },
  { from: 5200, to: 5261, cat: "shopping" },
  { from: 5732, to: 5735, cat: "shopping" },
  { from: 5942, to: 5943, cat: "education" },
  { from: 8211, to: 8299, cat: "education" },
  { from: 7832, to: 7841, cat: "entertainment" },
  { from: 7991, to: 7999, cat: "entertainment" },
  { from: 5815, to: 5818, cat: "entertainment" },
  { from: 7230, to: 7298, cat: "beauty" },
  { from: 4814, to: 4816, cat: "utilities" },
  { from: 4899, to: 4900, cat: "utilities" },
  { from: 4812, to: 4812, cat: "utilities" },
  { from: 4722, to: 4722, cat: "travel" },
  { from: 3000, to: 3350, cat: "travel" },
  { from: 3500, to: 3999, cat: "travel" },
  { from: 7011, to: 7011, cat: "travel" },
  { from: 6010, to: 6012, cat: "atm" },
  { from: 4829, to: 4829, cat: "transfers" },
  { from: 6536, to: 6538, cat: "transfers" },
];

export function mccToCategory(mcc: number, amount: number): Category {
  if (amount > 0) return CATEGORIES.income;
  for (const r of RANGES) {
    if (mcc >= r.from && mcc <= r.to) return CATEGORIES[r.cat];
  }
  return CATEGORIES.other;
}
