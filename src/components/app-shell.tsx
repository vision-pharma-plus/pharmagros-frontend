"use client";

import {
  ArrowLeftRight,
  Banknote,
  Bell,
  Boxes,
  ClipboardList,
  Factory,
  FileText,
  FolderTree,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PackageCheck,
  PackagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  Ruler,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Undo2,
  UserCog,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { BRAND_NAME, Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { useTranslation } from "@/lib/i18n/provider";
import { useAuth } from "@/lib/stores/auth";
import { useUnread } from "@/lib/stores/notifications";
import { useSidebar } from "@/lib/stores/sidebar";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  labelKey: keyof Dictionary["nav"];
  icon: React.ComponentType<{ className?: string }>;
  /** Any one of these permissions grants visibility. */
  permissions: string[];
}

interface NavSection {
  labelKey: keyof Dictionary["nav"];
  items: NavItem[];
}

/**
 * Navigation model.
 *
 * Each entry declares the permissions that make it relevant. A section with no
 * visible items is hidden entirely, so a technician does not see an
 * "Administration" heading they can never open.
 */
const NAV: NavSection[] = [
  {
    labelKey: "dashboard",
    items: [
      {
        href: "/dashboard",
        labelKey: "dashboard",
        icon: LayoutDashboard,
        permissions: ["reporting.view_dashboard"],
      },
    ],
  },
  {
    labelKey: "catalog",
    items: [
      {
        href: "/catalog/medicines",
        labelKey: "medicines",
        icon: Package,
        permissions: ["catalog.view_medicine"],
      },
      {
        href: "/catalog/categories",
        labelKey: "categories",
        icon: FolderTree,
        permissions: ["catalog.view_medicine"],
      },
      {
        href: "/catalog/manufacturers",
        labelKey: "manufacturers",
        icon: Factory,
        permissions: ["catalog.view_medicine"],
      },
      {
        href: "/catalog/units",
        labelKey: "units",
        icon: Ruler,
        permissions: ["catalog.view_medicine"],
      },
    ],
  },
  {
    labelKey: "inventory",
    items: [
      // First in the group: receiving is the task a user arrives with ("a
      // delivery is on the counter"), whereas the screens below it are things
      // they consult afterwards. It was previously reachable only through a
      // conditional button on a purchase order, which left direct deliveries
      // and go-live stock with no route in at all.
      {
        href: "/inventory/receive",
        labelKey: "receiveStock",
        icon: PackagePlus,
        permissions: ["inventory.receive_stock"],
      },
      {
        href: "/inventory/stock",
        labelKey: "stockLevels",
        icon: Boxes,
        permissions: ["inventory.view_stock"],
      },
      {
        href: "/inventory/batches",
        labelKey: "batches",
        icon: ClipboardList,
        permissions: ["inventory.view_batch"],
      },
      {
        href: "/inventory/movements",
        labelKey: "movements",
        icon: ArrowLeftRight,
        permissions: ["inventory.view_stock"],
      },
      {
        href: "/inventory/warehouses",
        labelKey: "warehouses",
        icon: Warehouse,
        permissions: ["inventory.view_stock"],
      },
    ],
  },
  {
    labelKey: "sales",
    items: [
      {
        href: "/sales",
        labelKey: "salesList",
        icon: ShoppingCart,
        permissions: ["sales.view_sale"],
      },
      {
        href: "/sales/returns",
        labelKey: "returns",
        icon: Undo2,
        permissions: ["sales.view_sale"],
      },
      {
        href: "/invoicing/invoices",
        labelKey: "invoices",
        icon: FileText,
        permissions: ["invoicing.view_invoice"],
      },
      {
        href: "/invoicing/payments",
        labelKey: "payments",
        icon: Banknote,
        permissions: ["invoicing.view_invoice"],
      },
    ],
  },
  {
    labelKey: "purchasing",
    items: [
      {
        href: "/purchasing/orders",
        labelKey: "purchaseOrders",
        icon: ClipboardList,
        permissions: ["purchasing.view_order"],
      },
      {
        href: "/purchasing/receipts",
        labelKey: "goodsReceipts",
        icon: PackageCheck,
        permissions: ["purchasing.view_order"],
      },
    ],
  },
  {
    labelKey: "partners",
    items: [
      {
        href: "/partners/customers",
        labelKey: "customers",
        icon: Users,
        permissions: ["partners.view_customer"],
      },
      {
        href: "/partners/suppliers",
        labelKey: "suppliers",
        icon: Truck,
        permissions: ["partners.view_supplier"],
      },
    ],
  },
  {
    labelKey: "reports",
    items: [
      {
        href: "/reports",
        labelKey: "reports",
        icon: PieChart,
        permissions: [
          "reporting.view_inventory_reports",
          "reporting.view_sales_reports",
          "reporting.view_financial_reports",
          "reporting.view_compliance_reports",
        ],
      },
    ],
  },
  {
    labelKey: "administration",
    items: [
      {
        href: "/admin/users",
        labelKey: "users",
        icon: UserCog,
        permissions: ["accounts.view_user"],
      },
      {
        href: "/admin/roles",
        labelKey: "roles",
        icon: KeyRound,
        permissions: ["accounts.view_user"],
      },
      {
        href: "/admin/audit",
        labelKey: "auditLog",
        icon: ShieldCheck,
        permissions: ["core.view_auditlog"],
      },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, canAny } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  // Matches Tailwind's `lg`, the breakpoint at which the drawer becomes a
  // permanent sidebar. Starts false so SSR and the first client render agree.
  const [isDesktop, setIsDesktop] = useState(false);
  const unread = useUnread((state) => state.unread);
  const collapsedPreference = useSidebar((state) => state.collapsed);
  const toggleSidebar = useSidebar((state) => state.toggle);
  const initSidebar = useSidebar((state) => state.init);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => initSidebar(), [initSidebar]);

  /**
   * The rail is a desktop-only affordance. Below `lg` the sidebar is a drawer
   * that is either open at full width or off-screen entirely, so collapsing it
   * there would only produce a narrow strip of unlabelled icons.
   */
  const collapsed = collapsedPreference && isDesktop;
  const refreshUnread = useUnread((state) => state.refresh);

  useEffect(() => {
    void refreshUnread();
    // 60s: expiry and stock alerts are generated by scheduled jobs, so a
    // tighter interval would add load without surfacing anything sooner. The
    // notifications screen also refreshes this directly on read, so the badge
    // never lags behind an action the user just took.
    const timer = setInterval(() => void refreshUnread(), 60_000);
    return () => clearInterval(timer);
  }, [refreshUnread]);

  // Close the mobile drawer whenever navigation occurs.
  useEffect(() => setMobileOpen(false), [pathname]);

  /**
   * Drawer keyboard behaviour.
   *
   * The drawer is a hand-rolled panel rather than a Radix dialog, so Escape,
   * the focus trap and focus restoration have to be provided here — without
   * them a keyboard user tabs straight past the overlay into the page behind
   * it and cannot get out.
   */
  useEffect(() => {
    if (!mobileOpen) return;

    const opener = document.activeElement as HTMLElement | null;
    const drawer = drawerRef.current;

    const focusable = () =>
      Array.from(
        drawer?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );

    focusable()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    // The page behind the overlay must not scroll under the drawer.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [mobileOpen]);

  /**
   * Title for the mobile header.
   *
   * Resolved from the nav model by longest matching prefix so that detail and
   * sub-routes (`/sales/new`, `/invoicing/invoices/:id`) inherit their
   * section's label rather than falling back to the app name.
   */
  const currentTitle = (() => {
    const match = NAV.flatMap((section) => section.items)
      .filter(
        (item) =>
          pathname === item.href || pathname.startsWith(`${item.href}/`),
      )
      .sort((a, b) => b.href.length - a.href.length)[0];

    if (match) return t.nav[match.labelKey];
    if (pathname.startsWith("/notifications")) return t.nav.notifications;
    if (pathname.startsWith("/profile")) return t.nav.profile;
    return t.common.appName;
  })();

  const visibleSections = NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => canAny(...item.permissions)),
  })).filter((section) => section.items.length > 0);

  const initials =
    user?.full_name
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "—";

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <div className="flex min-h-screen bg-muted/20">
      {/* Backdrop for the mobile drawer. Not a button: it would otherwise sit
          in the tab order as an unlabelled full-screen control, and Escape
          plus the drawer's own close button already cover keyboard users. */}
      {mobileOpen && (
        <div
          aria-hidden
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        ref={drawerRef}
        // Off-screen on mobile means out of the tab order too — otherwise
        // every nav link stays focusable while the drawer is shut. On desktop
        // the sidebar is always visible, so it is never inert there.
        inert={!mobileOpen && !isDesktop}
        aria-label={t.nav.navigation}
        // Fixed at every size — it was `lg:static` on desktop, so the whole
        // sidebar scrolled away with the page on long list screens. Only the
        // nav list scrolls now; the brand and the account block stay put.
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-card transition-[transform,width] duration-200 ease-out lg:translate-x-0",
          collapsed ? "w-[4.5rem]" : "w-64",
          mobileOpen ? "translate-x-0 shadow-xl lg:shadow-none" : "-translate-x-full",
        )}
      >
        <div
          className={cn(
            "flex h-16 shrink-0 items-center gap-2.5 border-b border-border",
            collapsed ? "justify-center px-2" : "px-5",
          )}
        >
          {/* Collapsed, the wordmark has nowhere to go, so the rail leads with
              the toggle instead — the one control that gets the labels back. */}
          {!collapsed && (
            <Link
              href="/dashboard"
              aria-label={BRAND_NAME}
              className="min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Logo className="h-9" priority />
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn("hidden lg:inline-flex", !collapsed && "ml-auto")}
            onClick={toggleSidebar}
            aria-label={collapsed ? t.nav.expandSidebar : t.nav.collapseSidebar}
            title={collapsed ? t.nav.expandSidebar : t.nav.collapseSidebar}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label={t.nav.closeMenu}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Only this list scrolls, so the brand above and the account block
            below stay visible however long the navigation grows. */}
        <nav
          className={cn(
            "min-h-0 flex-1 space-y-6 overflow-y-auto py-4",
            collapsed ? "px-2" : "px-3",
          )}
        >
          {visibleSections.map((section, index) => (
            <div
              key={section.labelKey}
              role="group"
              aria-label={t.nav[section.labelKey]}
            >
              {/* Collapsed, the headings would wrap or clip at 4.5rem. A rule
                  between groups keeps the grouping readable without them, and
                  the accessible name still names the section for screen
                  readers. The first group needs no rule above it. */}
              {collapsed ? (
                index > 0 && (
                  <div
                    aria-hidden
                    className="mx-2 mb-2 h-px bg-border"
                  />
                )
              ) : (
                <p className="px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {t.nav[section.labelKey]}
                </p>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-md py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          collapsed ? "justify-center px-2" : "px-2.5",
                          active
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                        aria-current={active ? "page" : undefined}
                        // Collapsed, the icon is the only thing left on screen,
                        // so the label has to survive as a hover tooltip.
                        title={collapsed ? t.nav[item.labelKey] : undefined}
                      >
                        {/* A left rail marks the current page independently of
                            colour, which the tinted background alone did not.
                            Collapsed it sits outside the centred icon so it
                            still reads as an edge marker, not a stray dash. */}
                        {active && (
                          <span
                            aria-hidden
                            className={cn(
                              "absolute inset-y-1 w-0.5 rounded-full bg-primary",
                              collapsed ? "-left-2" : "left-0",
                            )}
                          />
                        )}
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors",
                            active
                              ? "text-primary"
                              : "text-muted-foreground/70 group-hover:text-foreground",
                          )}
                        />
                        {/* Hidden rather than dropped: the link would
                            otherwise have no accessible name at all in the
                            rail, leaving screen readers with a bare URL. */}
                        <span className={cn(collapsed ? "sr-only" : "truncate")}>
                          {t.nav[item.labelKey]}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-border p-3">
          {/* The account block is the profile link: it is where users look
              for their own settings, so it opens them rather than being inert
              text above the sign-out button. */}
          <Link
            href="/profile"
            className={cn(
              "mb-1 flex items-center gap-2.5 rounded-md py-1 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              collapsed ? "justify-center px-0" : "px-1.5",
              pathname === "/profile" && "bg-accent",
            )}
            aria-current={pathname === "/profile" ? "page" : undefined}
            // The initials avatar is decorative, so collapsed the link needs
            // both a tooltip and the hidden name below to stay identifiable.
            title={collapsed ? (user?.full_name ?? t.nav.profile) : undefined}
          >
            {/* Initials avatar: gives the block a fixed anchor point and makes
                the signed-in account legible at a glance. */}
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
            >
              {initials}
            </span>
            <div className={cn("min-w-0", collapsed && "sr-only")}>
              <p className="truncate text-sm font-medium">{user?.full_name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.email}
              </p>
            </div>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full text-muted-foreground hover:text-foreground",
              collapsed ? "justify-center px-0" : "justify-start",
            )}
            onClick={handleLogout}
            title={collapsed ? t.nav.logout : undefined}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className={cn(collapsed && "sr-only")}>{t.nav.logout}</span>
          </Button>
        </div>
      </aside>

      {/* Offset by the sidebar's width, which no longer takes up layout space
          now that it is fixed. Tracks the collapsed width so the reclaimed
          space actually goes to the content. */}
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col transition-[padding] duration-200 ease-out",
          collapsed ? "lg:pl-[4.5rem]" : "lg:pl-64",
        )}
      >
        {/* Translucent so content scrolling beneath reads as "under" the bar
            rather than colliding with it. */}
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label={t.nav.openMenu}
            aria-expanded={mobileOpen}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* The page h1 lives in the scrolling body, so once the user scrolls
              nothing on screen says where they are. */}
          <span className="truncate text-sm font-semibold">{currentTitle}</span>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {/* Theme and language are both "preferences", so they sit tighter
                to each other than to the bell, and a hairline divider separates
                that pair from the notification action. */}
            <div className="flex items-center gap-1.5">
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
            <span aria-hidden className="h-5 w-px bg-border" />
            <Link
              href="/notifications"
              className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t.nav.notifications}
            >
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -right-1 -top-1 h-5 min-w-5 justify-center px-1 text-[10px]"
                >
                  {unread > 99 ? "99+" : unread}
                </Badge>
              )}
            </Link>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
