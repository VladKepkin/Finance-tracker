"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const CLOSE_DRAG_PX = 110;
const CLOSE_VELOCITY = 0.11;
const EXIT_MS = 240;

export function Sheet({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = useState(open);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startY: number; lastY: number; lastT: number; velocity: number } | null>(null);
  const shown = useRef({ title, children });
  if (open) shown.current = { title, children };

  useEffect(() => {
    if (open) {
      setMounted(true);
      setDragY(0);
      return;
    }
    const t = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!mounted || typeof document === "undefined") return null;

  const state = open ? "open" : "closed";

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, velocity: 0 };
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.velocity = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    setDragY(Math.max(0, e.clientY - d.startY));
  };
  const onPointerUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragging(false);
    if (dragY > CLOSE_DRAG_PX || (d.velocity > CLOSE_VELOCITY && dragY > 8)) onClose();
    else setDragY(0);
  };

  return createPortal(
    <div className={cn("fixed inset-0 z-[60]", !open && "pointer-events-none")} role="dialog" aria-modal="true">
      <div data-state={state} className="sheet-overlay absolute inset-0 bg-foreground/35" onClick={onClose} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 flex justify-center">
        <div
          data-state={state}
          className={cn(
            "sheet-panel flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-background shadow-2xl",
            className
          )}
          style={{
            transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
            transition: open && !dragging ? "transform 0.4s var(--ease-drawer)" : "none",
          }}
        >
          <div
            className="shrink-0 cursor-grab touch-none px-5 pb-2 pt-2.5 active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="mx-auto h-1.5 w-10 rounded-full bg-foreground/15" />
            <div className="mt-3 flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold">{shown.current.title}</h2>
              <button
                onClick={onClose}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="Закрити"
                className="flex size-9 items-center justify-center rounded-full bg-card text-muted-foreground soft-shadow transition-transform duration-150 active:scale-95"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
          >
            {shown.current.children}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
