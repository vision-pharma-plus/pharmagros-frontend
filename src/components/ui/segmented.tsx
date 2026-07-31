"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  /** Visible content — an icon for compact groups, a short label otherwise. */
  content: React.ReactNode;
  /** Accessible name and tooltip. Required: an icon alone names nothing. */
  label: string;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for screen readers. */
  ariaLabel: string;
  className?: string;
}

/**
 * Segmented control — a sunken track with one thumb that slides to the active
 * option.
 *
 * The switchers this replaces rendered each option as its own filled/ghost
 * button, so a two- or three-way choice read as several independent actions.
 * Binding the selection to a single moving thumb says "one setting, currently
 * here" instead, and the movement carries the change across the group rather
 * than two fills swapping silently.
 *
 * Semantics stay real buttons in a radiogroup so keyboard and screen-reader
 * behaviour is unchanged; the thumb is decorative and measured from the DOM,
 * which keeps it correct when labels differ in width between locales.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: SegmentedProps<T>) {
  const trackRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef(new Map<T, HTMLButtonElement>());
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(
    null,
  );

  // Measure from the rendered buttons rather than assuming equal widths: "FR"
  // and "EN" happen to match, but a future locale or label need not.
  useEffect(() => {
    const track = trackRef.current;
    const active = buttonRefs.current.get(value);
    if (!track || !active) return;

    const measure = () => {
      const trackBox = track.getBoundingClientRect();
      const activeBox = active.getBoundingClientRect();
      setThumb({
        left: activeBox.left - trackBox.left,
        width: activeBox.width,
      });
    };

    measure();

    // Fonts landing after hydration shift label widths under the thumb.
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [value, options]);

  /** Roving arrow-key selection, which a radiogroup is expected to support. */
  const handleKeyDown = (event: React.KeyboardEvent) => {
    const delta =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!delta) return;

    event.preventDefault();
    const index = options.findIndex((option) => option.value === value);
    const next = options[(index + delta + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    buttonRefs.current.get(next.value)?.focus();
  };

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn(
        "relative inline-flex items-center rounded-full bg-muted/70 p-0.5 ring-1 ring-inset ring-border/60",
        className,
      )}
    >
      {/* The thumb. Hidden until measured so it never flashes at the origin,
          and untransitioned on that first paint so it does not fly in. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0.5 rounded-full bg-background shadow-sm ring-1 ring-inset ring-border/70",
          thumb
            ? "opacity-100 transition-[transform,width,opacity] duration-300 ease-swift"
            : "opacity-0",
        )}
        style={
          thumb
            ? { transform: `translateX(${thumb.left}px)`, width: thumb.width }
            : undefined
        }
      />

      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              if (node) buttonRefs.current.set(option.value, node);
              else buttonRefs.current.delete(option.value);
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            // Only the active option stays tabbable, so the group is one stop
            // in the tab order and arrows move within it.
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative z-10 flex h-7 items-center justify-center rounded-full px-2.5 text-xs font-semibold transition-colors duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              selected
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.content}
          </button>
        );
      })}
    </div>
  );
}
