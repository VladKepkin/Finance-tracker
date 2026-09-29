"use client";

import { Heart } from "lucide-react";
import type { CategoryJoy } from "@/lib/metrics/joy";
import { MIN_RATINGS, computeJoyVerdicts } from "@/lib/metrics/joy";
import { CATEGORIES } from "@/lib/mcc";
import { formatMoney, pluralUk } from "@/lib/format";
import { currencyMeta } from "@/lib/monobank";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function Joy({
  categories,
  ratedCount,
  ratableCount,
  fxUnavailableCurrency,
  ratingsLoading,
  ratingsError,
  base,
}: {
  categories: CategoryJoy[] | null;
  ratedCount: number;
  ratableCount: number;
  fxUnavailableCurrency: number | null;
  ratingsLoading: boolean;
  ratingsError: string | null;
  base: number;
}) {
  const verdicts = computeJoyVerdicts(categories ?? []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Heart className="size-4" /> Радість за гроші
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Медіана оцінки радості й частка витрат — з оцінених тобою покупок, окремо. «Joy per
          dollar» одним числом не існує (оцінка порядкова, гроші — ні).
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {ratableCount === 0 ? (
          <p className="text-sm text-muted-foreground">Немає витрат за цей період.</p>
        ) : fxUnavailableCurrency !== null ? (
          <p className="text-sm text-muted-foreground">
            Немає курсу для {currencyMeta(fxUnavailableCurrency).code} — суми оцінених витрат
            порахувати не можна.
          </p>
        ) : ratingsLoading ? (
          <p className="text-sm text-muted-foreground">Завантажуємо оцінки…</p>
        ) : ratingsError !== null ? (
          <p className="text-sm text-muted-foreground">
            Не вдалося завантажити оцінки: {ratingsError}. Спробуй оновити пізніше.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Оцінено {ratedCount} із {ratableCount} витрат за період.
            </p>

            {ratedCount === 0 && (
              <p className="text-sm text-muted-foreground">
                Постав оцінку хоч одній покупці у «Витратах», щоб побачити, де гроші приносять
                радість.
              </p>
            )}

            {(categories ?? []).map((c) => {
              const meta = CATEGORIES[c.key];
              const verdict = verdicts[c.key];
              return (
                <div key={c.key} className="rounded-xl bg-secondary p-3">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">
                      {meta?.emoji ?? "📦"} {meta?.label ?? c.key}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatMoney(c.spendBase, base)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    {c.shareOfRated !== null && (
                      <span>{Math.round(c.shareOfRated * 100)}% з оцінених тобою</span>
                    )}
                    {c.medianJoy !== null ? (
                      <span>· медіана радості {c.medianJoy}/5</span>
                    ) : (
                      <span>
                        · оціни ще {MIN_RATINGS - c.ratedCount}{" "}
                        {pluralUk(MIN_RATINGS - c.ratedCount, "покупку", "покупки", "покупок")} для медіани
                      </span>
                    )}
                  </div>
                  {verdict === "highJoyLowSpend" && (
                    <Badge variant="success" className="mt-2 text-[11px]">
                      мало грошей, багато радості — тут можна дозволити собі більше
                    </Badge>
                  )}
                  {verdict === "lowJoySpendHeavy" && (
                    <Badge variant="secondary" className="mt-2 text-[11px]">
                      помітна частка оціненого, радість нижча за твою ж медіану
                    </Badge>
                  )}
                </div>
              );
            })}
          </>
        )}
      </CardContent>
    </Card>
  );
}
