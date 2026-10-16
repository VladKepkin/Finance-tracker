"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { CheckIcon, ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface SelectContextValue {
  value: string | undefined;
  onValueChange: (val: string) => void;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  disabled?: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  selectedLabel: React.ReactNode;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

function useSelectCtx() {
  const ctx = React.useContext(SelectContext);
  if (!ctx) throw new Error("Select components must be used within <Select>");
  return ctx;
}

function collectSelectItems(children: React.ReactNode, map: Map<string, React.ReactNode>) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const props = child.props as { value?: unknown; children?: React.ReactNode };
    if (typeof props.value === "string") {
      map.set(props.value, props.children);
    } else if (props.children !== undefined) {
      collectSelectItems(props.children, map);
    }
  });
}

function Select({
  value: controlledValue,
  defaultValue,
  onValueChange,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  disabled,
  children,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState<string | undefined>(defaultValue);
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState<boolean>(defaultOpen);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  const isValueControlled = controlledValue !== undefined;
  const value = isValueControlled ? controlledValue : uncontrolledValue;

  const isOpenControlled = controlledOpen !== undefined;
  const open = isOpenControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = React.useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (updater) => {
      const next = typeof updater === "function" ? updater(open) : updater;
      if (!isOpenControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [open, isOpenControlled, onOpenChange]
  );

  const handleValueChange = React.useCallback(
    (nextVal: string) => {
      if (!isValueControlled) setUncontrolledValue(nextVal);
      onValueChange?.(nextVal);
      setOpen(false);
    },
    [isValueControlled, onValueChange, setOpen]
  );

  const selectedLabel = React.useMemo(() => {
    if (value === undefined) return undefined;
    const map = new Map<string, React.ReactNode>();
    collectSelectItems(children, map);
    return map.get(value);
  }, [children, value]);

  const ctxValue = React.useMemo<SelectContextValue>(
    () => ({
      value,
      onValueChange: handleValueChange,
      open,
      setOpen,
      disabled,
      triggerRef,
      selectedLabel,
    }),
    [value, handleValueChange, open, setOpen, disabled, selectedLabel]
  );

  return <SelectContext.Provider value={ctxValue}>{children}</SelectContext.Provider>;
}

function SelectGroup({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div role="group" data-slot="select-group" className={className} {...props}>
      {children}
    </div>
  );
}

function SelectValue({
  placeholder,
  children,
  className,
  ...props
}: React.ComponentProps<"span"> & { placeholder?: React.ReactNode }) {
  const { value, selectedLabel } = useSelectCtx();
  const content = children ?? selectedLabel ?? (value !== undefined && value !== "" ? value : placeholder);
  return (
    <span data-slot="select-value" className={cn("pointer-events-none truncate", className)} {...props}>
      {content}
    </span>
  );
}

function SelectTrigger({
  className,
  size = "default",
  children,
  disabled: propDisabled,
  onClick,
  ...props
}: React.ComponentProps<"button"> & {
  size?: "sm" | "default";
}) {
  const { open, setOpen, disabled: ctxDisabled, triggerRef, value } = useSelectCtx();
  const isDisabled = Boolean(ctxDisabled || propDisabled);

  return (
    <button
      ref={triggerRef}
      type="button"
      role="combobox"
      aria-expanded={open}
      data-slot="select-trigger"
      data-size={size}
      data-state={open ? "open" : "closed"}
      data-placeholder={value === undefined || value === "" ? "" : undefined}
      disabled={isDisabled}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented && !isDisabled) {
          setOpen((prev) => !prev);
        }
      }}
      className={cn(
        "border-input bg-transparent text-foreground data-[placeholder]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/40 flex w-fit items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm whitespace-nowrap shadow-sm transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon className="size-4 opacity-50 shrink-0" />
    </button>
  );
}

function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: React.ComponentProps<"div"> & { position?: "popper" | "item-aligned" }) {
  const { open, setOpen, triggerRef } = useSelectCtx();
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = React.useState<{
    top: number;
    left: number;
    minWidth: number;
    maxHeight: number;
  } | null>(null);

  React.useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const viewportW = window.innerWidth;
      const spaceBelow = viewportH - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      const preferAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(120, Math.min(320, preferAbove ? spaceAbove : spaceBelow));
      const left = Math.max(8, Math.min(rect.left, viewportW - Math.max(rect.width, 128) - 8));
      const top = preferAbove ? Math.max(8, rect.top - maxHeight - 4) : rect.bottom + 4;
      setCoords({
        top,
        left,
        minWidth: rect.width,
        maxHeight,
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, triggerRef]);

  React.useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (contentRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, setOpen, triggerRef]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={contentRef}
      role="listbox"
      data-slot="select-content"
      data-state="open"
      data-position={position}
      style={
        coords
          ? {
              position: "fixed",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              minWidth: `${coords.minWidth}px`,
              maxHeight: `${coords.maxHeight}px`,
            }
          : { position: "fixed", visibility: "hidden" }
      }
      className={cn(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 z-[80] min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md",
        className
      )}
      {...props}
    >
      {children}
    </div>,
    document.body
  );
}

function SelectItem({
  className,
  children,
  value,
  disabled,
  onClick,
  ...props
}: React.ComponentProps<"div"> & { value: string; disabled?: boolean }) {
  const { value: selectedValue, onValueChange } = useSelectCtx();
  const isSelected = selectedValue === value;

  return (
    <div
      role="option"
      aria-selected={isSelected}
      aria-disabled={disabled || undefined}
      data-slot="select-item"
      data-state={isSelected ? "checked" : "unchecked"}
      data-disabled={disabled ? "" : undefined}
      tabIndex={disabled ? undefined : 0}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented && !disabled) {
          onValueChange(value);
        }
      }}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !disabled) {
          e.preventDefault();
          onValueChange(value);
        }
      }}
      className={cn(
        "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        isSelected && "bg-accent/50 font-medium",
        className
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        {isSelected && <CheckIcon className="size-4" />}
      </span>
      <span>{children}</span>
    </div>
  );
}

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
};
