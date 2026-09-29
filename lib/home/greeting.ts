export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Доброго ранку";
  if (hour >= 12 && hour < 18) return "Добрий день";
  if (hour >= 18 && hour < 23) return "Добрий вечір";
  return "Доброї ночі";
}

export function todayLongUk(now: Date): string {
  const text = now.toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}
