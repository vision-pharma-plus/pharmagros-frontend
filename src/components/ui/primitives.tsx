"use client";

/**
 * Shared UI primitives.
 *
 * Grouped in one module rather than a file each: they are small, always used
 * together, and a single import keeps the screen files readable.
 */

import { cva, type VariantProps } from "class-variance-authority";
import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground shadow-sm",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export const CardHeader = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-base font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

export const CardContent = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

export const CardFooter = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({
  className,
  required,
  children,
  ...props
}: HTMLAttributes<HTMLLabelElement> & { htmlFor?: string; required?: boolean }) {
  return (
    <label
      className={cn(
        "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      {...props}
    >
      {children}
      {required && (
        <span className="ml-0.5 text-destructive" aria-hidden>
          *
        </span>
      )}
    </label>
  );
}

/**
 * Field wrapper that renders a label, control and validation message.
 *
 * The control is cloned to receive an id, `aria-describedby` and
 * `aria-invalid`. Doing it here rather than at every call site is what makes
 * the association reliable: almost no caller passed `htmlFor`, so most labels
 * in the product were not programmatically tied to their input, and error text
 * was never announced.
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const generatedId = useId();
  const controlId = htmlFor ?? generatedId;
  const messageId = `${controlId}-message`;
  const hasMessage = Boolean(error ?? hint);

  // Only a single element child can carry the wiring; anything else is left
  // untouched so the component never breaks an unusual layout.
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id:
          (children as ReactElement<{ id?: string }>).props.id ?? controlId,
        "aria-describedby":
          (children as ReactElement<{ "aria-describedby"?: string }>).props[
            "aria-describedby"
          ] ?? (hasMessage ? messageId : undefined),
        "aria-invalid": error ? true : undefined,
        "aria-required": required ? true : undefined,
      })
    : children;

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <Label htmlFor={controlId} required={required}>
          {label}
        </Label>
      )}
      {control}
      {error ? (
        <p
          id={messageId}
          className="text-xs font-medium text-destructive"
          // Errors appear after a submit the user just made, so announcing
          // politely is enough and does not interrupt them mid-typing.
          role="status"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/10 text-primary",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        success: "border-transparent bg-success/15 text-success",
        warning: "border-transparent bg-warning/15 text-warning",
        destructive: "border-transparent bg-destructive/15 text-destructive",
        outline: "text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

/**
 * Map a domain status to a badge colour.
 *
 * Centralised so the same status never reads green on one screen and grey on
 * another — inconsistent status colour is a real source of operator error.
 */
export function statusVariant(
  status: string,
): VariantProps<typeof badgeVariants>["variant"] {
  switch (status) {
    case "PAID":
    case "RECEIVED":
    case "APPROVED":
    case "COMPLETED":
    case "CONFIRMED":
    case "ACTIVE":
      return "success";
    case "PARTIALLY_PAID":
    case "PARTIALLY_RECEIVED":
    case "PENDING_APPROVAL":
    case "PENDING":
    case "QUARANTINED":
    case "PARTIALLY_RETURNED":
      return "warning";
    case "OVERDUE":
    case "CANCELLED":
    case "REJECTED":
    case "EXPIRED":
    case "BLOCKED":
    case "RECALLED":
    case "DAMAGED":
      return "destructive";
    case "DRAFT":
    case "INACTIVE":
    case "DEPLETED":
    case "CLOSED":
      return "secondary";
    default:
      return "default";
  }
}

/**
 * Badge colour for an invoice's OBR declaration status.
 *
 * Separate from `statusVariant` because three of the values collide with
 * commercial statuses that carry the opposite meaning: a fiscal CANCELLED is
 * a *successfully filed* withdrawal, not a failure, and a fiscal PENDING is
 * the ordinary happy path rather than something awaiting a human.
 */
export function fiscalVariant(
  status: string,
): VariantProps<typeof badgeVariants>["variant"] {
  switch (status) {
    case "DECLARED":
    case "CANCELLED":
      return "success";
    case "PENDING":
      // Informational, not a warning: queued is where every invoice starts.
      return "secondary";
    case "REJECTED":
      return "destructive";
    default:
      return "default";
  }
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export function Table({
  className,
  ...props
}: HTMLAttributes<HTMLTableElement>) {
  return (
    // Wide tables scroll inside their own container so the page body never
    // scrolls horizontally.
    <div className="w-full overflow-x-auto">
      <table
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

export function THead({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("border-b border-border bg-muted/40", className)}
      {...props}
    />
  );
}

export function TBody({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-border", className)} {...props} />;
}

export function TR({
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("transition-colors hover:bg-muted/40", className)}
      {...props}
    />
  );
}

export function TH({
  className,
  numeric,
  ...props
}: HTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      className={cn(
        "h-11 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        numeric ? "text-right" : "text-left",
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  numeric,
  ...props
}: HTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <td
      className={cn(
        "px-4 py-3 align-middle",
        // Tabular numerals keep decimal points aligned down a money column,
        // which is what makes a total column scannable.
        numeric ? "text-right tabular-nums" : "text-left",
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export function Alert({
  variant = "default",
  title,
  children,
  className,
}: {
  variant?: "default" | "warning" | "destructive" | "success";
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  // Body text stays on `foreground` rather than the accent colour: amber on a
  // 10%-amber wash does not reach 4.5:1, and a warning nobody can read is
  // worse than no warning. The border and icon carry the colour instead.
  const styles = {
    default: "border-border bg-muted/50 text-foreground",
    warning: "border-warning/40 bg-warning/10 text-foreground",
    destructive: "border-destructive/40 bg-destructive/10 text-foreground",
    success: "border-success/40 bg-success/10 text-foreground",
  } as const;

  return (
    <div
      // Warnings are assertive too: a credit-limit breach or an expired
      // licence changes what the user is about to do, so it must not wait for
      // a pause in speech the way a polite status would.
      role={
        variant === "destructive" || variant === "warning" ? "alert" : "status"
      }
      className={cn("rounded-md border px-4 py-3 text-sm", styles[variant], className)}
    >
      {title && <p className="mb-1 font-semibold">{title}</p>}
      {children}
    </div>
  );
}

export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <p className="font-medium">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action}
    </div>
  );
}

/**
 * A determinate progress bar with an optional percentage label.
 *
 * `value` is a percentage, accepted as a string because that is how the
 * backend sends decimals — parsing it here keeps the precision rule ("never
 * put money or rates through `number` on the way in") at one boundary.
 *
 * The bar is clamped to 0-100 for width purposes while the *label* shows the
 * real figure, so an over-settled invoice reads as "104 %" against a full bar
 * rather than silently overflowing its track.
 */
export function Progress({
  value,
  label,
  tone = "default",
  className,
  showValue = true,
}: {
  value: string | number;
  label?: string;
  tone?: "default" | "success" | "warning" | "danger";
  className?: string;
  showValue?: boolean;
}) {
  const numeric = typeof value === "number" ? value : Number.parseFloat(value);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  const width = Math.min(Math.max(safe, 0), 100);

  const tones: Record<string, string> = {
    default: "bg-primary",
    success: "bg-emerald-600 dark:bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-destructive",
  };

  return (
    <div className={cn("w-full", className)}>
      {(label || showValue) && (
        <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
          {label && <span className="text-muted-foreground">{label}</span>}
          {showValue && (
            <span className="font-medium tabular-nums">
              {safe.toFixed(safe % 1 === 0 ? 0 : 1)}%
            </span>
          )}
        </div>
      )}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(safe)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn("h-full rounded-full transition-all", tones[tone])}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
