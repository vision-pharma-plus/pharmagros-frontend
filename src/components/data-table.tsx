"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Alert,
  EmptyState,
  Input,
  Skeleton,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from "@/components/ui/primitives";
import type { ApiError } from "@/lib/api/client";
import { translateError } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";

export interface Column<T> {
  key: string;
  header: string;
  numeric?: boolean;
  render: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: ApiError | null;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  /** True when a search or filter is narrowing the result set. */
  isFiltered?: boolean;
  /** Resets every filter; renders a "clear filters" action when empty. */
  onClearFilters?: () => void;

  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;

  page?: number;
  totalPages?: number;
  count?: number;
  onPageChange?: (page: number) => void;

  toolbar?: React.ReactNode;
}

/**
 * Shared list table.
 *
 * Every list screen uses this so pagination, empty state, error handling and
 * search behave identically across the application — inconsistency in those
 * details is what makes an internal tool feel unreliable.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  error = null,
  onRetry,
  onRowClick,
  emptyTitle,
  isFiltered = false,
  onClearFilters,
  search,
  onSearchChange,
  searchPlaceholder,
  page = 1,
  totalPages = 1,
  count = 0,
  onPageChange,
  toolbar,
}: DataTableProps<T>) {
  const t = useTranslation();
  const errorMessage = translateError(error, t);

  return (
    <div className="space-y-4">
      {(onSearchChange || toolbar) && (
        <div className="flex flex-wrap items-center gap-3">
          {onSearchChange && (
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search ?? ""}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={searchPlaceholder ?? t.common.search}
                className="pl-9"
                type="search"
              />
            </div>
          )}
          {toolbar && <div className="flex items-center gap-2">{toolbar}</div>}
        </div>
      )}

      {errorMessage ? (
        <Alert variant="destructive" title={t.common.errorOccurred}>
          <p className="mb-3">{errorMessage}</p>
          {onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry}>
              {t.common.retry}
            </Button>
          )}
        </Alert>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          {loading ? (
            // Mirrors the loaded table — real header, one placeholder cell per
            // column — so the layout does not jump when the data arrives.
            <Table>
              <THead>
                <TR>
                  {columns.map((column) => (
                    <TH
                      key={column.key}
                      numeric={column.numeric}
                      className={column.className}
                    >
                      {column.header}
                    </TH>
                  ))}
                </TR>
              </THead>
              <TBody>
                {Array.from({ length: 8 }).map((_, rowIndex) => (
                  <TR key={rowIndex}>
                    {columns.map((column) => (
                      <TD key={column.key} className={column.className}>
                        <Skeleton className="h-4 w-full" />
                      </TD>
                    ))}
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : rows.length === 0 ? (
            // An active filter that matched nothing is a different situation
            // from an empty dataset, and needs a way back out.
            isFiltered ? (
              <EmptyState
                title={t.common.noMatchingResults}
                description={t.common.noMatchingResultsHint}
                action={
                  onClearFilters && (
                    <Button variant="outline" size="sm" onClick={onClearFilters}>
                      {t.common.clearFilters}
                    </Button>
                  )
                }
              />
            ) : (
              <EmptyState title={emptyTitle ?? t.common.noResults} />
            )
          ) : (
            <Table>
              <THead>
                <TR>
                  {columns.map((column) => (
                    <TH
                      key={column.key}
                      numeric={column.numeric}
                      className={column.className}
                    >
                      {column.header}
                    </TH>
                  ))}
                </TR>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR
                    key={rowKey(row)}
                    onClick={
                      onRowClick
                        ? (event) => {
                            // A button or link inside the row handles its own
                            // click; the row must not navigate as well.
                            if (
                              (event.target as HTMLElement).closest(
                                "button, a, input, select, textarea",
                              )
                            )
                              return;
                            onRowClick(row);
                          }
                        : undefined
                    }
                    // A clickable row must also be reachable by keyboard —
                    // otherwise detail screens have no non-mouse route in.
                    tabIndex={onRowClick ? 0 : undefined}
                    role={onRowClick ? "button" : undefined}
                    onKeyDown={
                      onRowClick
                        ? (event) => {
                            if (event.key !== "Enter" && event.key !== " ")
                              return;
                            // Ignore keys aimed at a control inside the row.
                            if (event.target !== event.currentTarget) return;
                            event.preventDefault();
                            onRowClick(row);
                          }
                        : undefined
                    }
                    className={
                      onRowClick
                        ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        : undefined
                    }
                  >
                    {columns.map((column) => (
                      <TD
                        key={column.key}
                        numeric={column.numeric}
                        className={column.className}
                      >
                        {column.render(row)}
                      </TD>
                    ))}
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      )}

      {/* The count is useful on its own: gating the whole row on
          `totalPages > 1` hid "8 results" from every short search. */}
      {!errorMessage && !loading && rows.length > 0 && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground tabular-nums">
            {count} {t.common.results}
          </p>
          {onPageChange && totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              {t.common.previous}
            </Button>
            <span className="tabular-nums text-muted-foreground">
              {t.common.page} {page} {t.common.of} {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              {t.common.next}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
