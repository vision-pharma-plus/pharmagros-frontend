"use client";

import { AlertTriangle, Bell, CheckCheck, Info } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  EmptyState,
  Skeleton,
} from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { ApiError, api } from "@/lib/api/client";
import type { Notification } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";
import { translateError, usePaginatedQuery } from "@/lib/hooks";
import { useTranslation } from "@/lib/i18n/provider";
import { useUnread } from "@/lib/stores/notifications";
import { cn } from "@/lib/utils";

const SEVERITY_ICON = {
  INFO: Info,
  WARNING: AlertTriangle,
  CRITICAL: AlertTriangle,
} as const;

const SEVERITY_VARIANT = {
  INFO: "default",
  WARNING: "warning",
  CRITICAL: "destructive",
} as const;

export default function NotificationsPage() {
  const t = useTranslation();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [marking, setMarking] = useState(false);
  const refreshUnread = useUnread((state) => state.refresh);

  const query = usePaginatedQuery<Notification>(
    "/notifications/notifications/",
    { unread: unreadOnly ? true : undefined },
  );

  const markAllRead = async () => {
    setMarking(true);
    try {
      await api.post("/notifications/notifications/mark-all-read/");
      toast.success(t.toasts.allMarkedRead);
      query.refetch();
      // Clear the header badge immediately rather than leaving it stale until
      // the next 60-second poll.
      void refreshUnread();
    } catch (caught) {
      toast.error(
        t.toasts.actionFailed,
        caught instanceof ApiError ? translateError(caught, t) : undefined,
      );
    } finally {
      setMarking(false);
    }
  };

  const markRead = async (notification: Notification) => {
    if (notification.is_read) return;
    try {
      await api.post(
        `/notifications/notifications/${notification.id}/mark-read/`,
      );
      query.refetch();
      void refreshUnread();
    } catch (caught) {
      toast.error(
        t.toasts.actionFailed,
        caught instanceof ApiError ? translateError(caught, t) : undefined,
      );
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t.nav.notifications}</h1>
          <p className="text-sm text-muted-foreground">
            {query.count} {t.common.results}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-pressed={unreadOnly}
            onClick={() => setUnreadOnly((current) => !current)}
          >
            {unreadOnly ? t.notifications.showAll : t.notifications.unreadOnly}
          </Button>
          <Button size="sm" loading={marking} onClick={() => void markAllRead()}>
            <CheckCheck className="h-4 w-4" />
            {t.notifications.markAllRead}
          </Button>
        </div>
      </div>

      {query.error ? (
        <Alert variant="destructive" title={t.common.errorOccurred}>
          {translateError(query.error, t)}
        </Alert>
      ) : query.loading ? (
        // Same card row as below: severity icon, title with its code badge,
        // body line, then the timestamp.
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="flex items-start gap-3 p-4">
                <Skeleton className="mt-0.5 h-5 w-5 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-5 w-24 rounded-full" />
                  </div>
                  <Skeleton className="mt-2 h-3.5 w-full max-w-md" />
                  <Skeleton className="mt-2 h-3 w-32" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : query.items.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<Bell className="h-8 w-8" />}
              title={t.notifications.emptyTitle}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {query.items.map((notification) => {
            const Icon =
              SEVERITY_ICON[notification.severity] ?? Info;
            const variant = SEVERITY_VARIANT[notification.severity] ?? "default";

            const body = (
              <CardContent className="flex items-start gap-3 p-4">
                <Icon
                  className={`mt-0.5 h-5 w-5 shrink-0 ${
                    notification.severity === "CRITICAL"
                      ? "text-destructive"
                      : notification.severity === "WARNING"
                        ? "text-warning"
                        : "text-muted-foreground"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{notification.title}</p>
                    <Badge variant={variant}>{notification.code_display}</Badge>
                    {!notification.is_read && (
                      <span className="sr-only">{t.notifications.unread}</span>
                    )}
                  </div>
                  {notification.body && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {notification.body}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(notification.created_at)}
                  </p>
                </div>
              </CardContent>
            );

            const cardClass = notification.is_read
              ? "opacity-70"
              : "border-l-4 border-l-primary";

            /**
             * A single focusable element per notification.
             *
             * Previously a non-focusable `div` carried the click handler and
             * wrapped a `Link`, so keyboard users could not mark anything read
             * and a linked notification raced a refetch against navigation.
             */
            return (
              <Card
                key={notification.id}
                className={cn(
                  cardClass,
                  "focus-within:ring-2 focus-within:ring-ring",
                )}
              >
                {notification.link ? (
                  <Link
                    href={notification.link}
                    onClick={() => void markRead(notification)}
                    className="block focus:outline-none"
                  >
                    {body}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => void markRead(notification)}
                    disabled={notification.is_read}
                    className="block w-full text-left focus:outline-none disabled:cursor-default"
                  >
                    {body}
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
