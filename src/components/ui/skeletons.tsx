"use client";

/**
 * Page-shaped loading skeletons.
 *
 * A skeleton is only useful if it predicts the layout that replaces it: the
 * same header block, the same card grid, the same table columns. A generic
 * grey slab tells the user "something is coming" and then reflows the whole
 * page when it lands. Each helper here mirrors one real page shape, so the
 * only thing that changes on load is the content inside the boxes.
 */

import { Card, CardContent, CardHeader, Skeleton } from "./primitives";
import { cn } from "@/lib/utils";

/**
 * Detail/form page header: optional back link, title, badges, subtitle, and
 * the action buttons that sit opposite it.
 */
export function PageHeaderSkeleton({
  back = false,
  badges = 0,
  actions = 0,
  titleWidth = "w-64",
}: {
  back?: boolean;
  badges?: number;
  actions?: number;
  titleWidth?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {back && <Skeleton className="-ml-2 mb-1 h-8 w-28" />}
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className={cn("h-8", titleWidth)} />
          {Array.from({ length: badges }).map((_, index) => (
            <Skeleton key={index} className="h-5 w-20 rounded-full" />
          ))}
        </div>
        <Skeleton className="mt-2 h-4 w-40" />
      </div>
      {actions > 0 && (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: actions }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-28" />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A card of label/value rows — the `divide-y` detail card used across every
 * detail page. Row heights match `DetailRow`'s `py-1.5 text-sm`.
 */
export function DetailCardSkeleton({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-4 w-36" />
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex justify-between gap-4 py-2.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * A card of form fields — label above control, matching `Field`'s spacing.
 * `pairs` marks sections laid out as `sm:grid-cols-2`.
 */
export function FormCardSkeleton({
  fields = 4,
  paired = false,
  className,
}: {
  fields?: number;
  paired?: boolean;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-4 w-36" />
      </CardHeader>
      <CardContent
        className={cn(
          paired ? "grid gap-4 sm:grid-cols-2" : "space-y-4",
        )}
      >
        {Array.from({ length: fields }).map((_, index) => (
          <div key={index} className="space-y-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Table body placeholder that keeps the real column count and alignment, so
 * the header row above it does not jump when rows arrive.
 */
export function TableSkeleton({
  columns = 5,
  rows = 6,
  className,
}: {
  columns?: number;
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)}>
      <div className="flex h-11 items-center gap-4 border-b border-border px-4">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0"
        >
          {Array.from({ length: columns }).map((_, index) => (
            <Skeleton key={index} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A card whose whole body is a table — header, then rows. */
export function TableCardSkeleton({
  columns = 5,
  rows = 6,
  className,
}: {
  columns?: number;
  rows?: number;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-4 w-36" />
      </CardHeader>
      <CardContent className="px-0">
        <TableSkeleton columns={columns} rows={rows} />
      </CardContent>
    </Card>
  );
}

/**
 * The permission matrix: module headings, each followed by a run of
 * checkbox rows, inside the scroll area the real list uses.
 */
export function PermissionListCardSkeleton({
  modules = 5,
  perModule = 4,
  className,
}: {
  modules?: number;
  perModule?: number;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent>
        <div className="max-h-[32rem] space-y-4 overflow-hidden pr-1">
          {Array.from({ length: modules }).map((_, moduleIndex) => (
            <div key={moduleIndex}>
              <Skeleton className="mb-1.5 h-3 w-24" />
              <div className="space-y-1">
                {Array.from({ length: perModule }).map((_, index) => (
                  <div key={index} className="flex items-start gap-2 py-0.5">
                    <Skeleton className="h-4 w-4 shrink-0" />
                    <Skeleton className="h-4 w-full max-w-[16rem]" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** KPI tile row — matches the 104px tiles on the dashboard and summary strips. */
export function StatTilesSkeleton({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index}>
          <CardContent className="space-y-2 p-5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Line-chart placeholder: plot area with gridlines and an axis of tick
 * labels, at the same height the chart renders at.
 */
export function ChartSkeleton({
  height = "h-64",
  className,
}: {
  height?: string;
  className?: string;
}) {
  return (
    <div className={cn("w-full", height, className)}>
      <div className="flex h-full flex-col justify-between pb-6">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-px w-full rounded-none" />
        ))}
      </div>
      <div className="flex justify-between">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className="h-3 w-10" />
        ))}
      </div>
    </div>
  );
}

/**
 * Whole detail page: header plus a grid of detail cards. `columns` and the
 * per-card row counts should match the page being stood in for.
 */
export function DetailPageSkeleton({
  columns = 2,
  cards = [5, 5],
  back = true,
  badges = 1,
  actions = 2,
  children,
}: {
  columns?: 2 | 3;
  cards?: number[];
  back?: boolean;
  badges?: number;
  actions?: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton back={back} badges={badges} actions={actions} />
      <div
        className={cn(
          "grid gap-5",
          columns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2",
        )}
      >
        {cards.map((rows, index) => (
          <DetailCardSkeleton key={index} rows={rows} />
        ))}
      </div>
      {children}
    </div>
  );
}

/**
 * Whole form page: header with cancel/save, then the two-column card grid the
 * forms all use.
 */
export function FormPageSkeleton({
  cards = [4, 4],
  paired = false,
}: {
  cards?: number[];
  paired?: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Skeleton className="h-8 w-56" />
          <Skeleton className="mt-2 h-4 w-32" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {cards.map((fields, index) => (
          <FormCardSkeleton key={index} fields={fields} paired={paired} />
        ))}
      </div>
    </div>
  );
}
