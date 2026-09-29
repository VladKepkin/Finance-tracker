"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { REFRESH_COOLDOWN_MS } from "@/lib/useMono";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RefreshButton({
  lastFetched,
  refreshing,
  onClick,
}: {
  lastFetched: number | null;
  refreshing: boolean;
  onClick: () => void;
}) {
  const [cooldownLeft, setCooldownLeft] = useState(0);

  useEffect(() => {
    if (!lastFetched) {
      setCooldownLeft(0);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((lastFetched + REFRESH_COOLDOWN_MS - Date.now()) / 1000));
      setCooldownLeft(left);
      return left;
    };
    if (tick() <= 0) return;
    const id = setInterval(() => {
      if (tick() <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [lastFetched]);

  return (
    <Button
      variant="outline"
      size="icon"
      className="size-11 rounded-full border-transparent soft-shadow"
      onClick={onClick}
      disabled={refreshing || cooldownLeft > 0}
      title={cooldownLeft > 0 ? `Оновити можна через ${cooldownLeft} с` : "Оновити"}
      aria-label={cooldownLeft > 0 ? `Оновити можна через ${cooldownLeft} с` : "Оновити"}
    >
      <span className="relative flex size-full items-center justify-center">
        {cooldownLeft > 0 && (
          <svg viewBox="0 0 44 44" className="absolute inset-0 size-full -rotate-90" aria-hidden>
            <circle
              cx="22"
              cy="22"
              r="19"
              fill="none"
              stroke="var(--brand-violet)"
              strokeWidth="2"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1"
              style={{
                strokeDashoffset: 1 - cooldownLeft / (REFRESH_COOLDOWN_MS / 1000),
                transition: "stroke-dashoffset 1s linear",
              }}
            />
          </svg>
        )}
        <RefreshCw className={cn("size-4", refreshing && "spin", cooldownLeft > 0 && "opacity-40")} />
      </span>
    </Button>
  );
}
