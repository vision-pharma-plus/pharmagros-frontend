"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Monitor, Moon, Sun } from "lucide-react";

import { useTranslation } from "@/lib/i18n/provider";
import { useTheme, type Theme } from "@/lib/stores/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Theme; icon: typeof Sun }[] = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
];

/**
 * Theme switch — a single icon button opening a menu.
 *
 * Theme is set once and rarely revisited, so it no longer earns the width of a
 * three-option segmented control next to the language switcher, which is
 * changed far more often. The trigger shows the current choice; the menu spells
 * the options out.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslation();
  const theme = useTheme((state) => state.theme);
  const setTheme = useTheme((state) => state.setTheme);

  const labels: Record<Theme, string> = {
    light: t.theme.light,
    dark: t.theme.dark,
    system: t.theme.system,
  };

  const Current = (OPTIONS.find((option) => option.value === theme) ?? OPTIONS[2]!).icon;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          // The accessible name carries the current value, which the icon alone
          // does not convey — "System" and "Light" are both a bare glyph.
          aria-label={`${t.theme.label}: ${labels[theme]}`}
          title={`${t.theme.label}: ${labels[theme]}`}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-foreground",
            className,
          )}
        >
          <Current className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-36 rounded-md border border-border bg-background p-1 text-foreground shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <DropdownMenu.RadioGroup
            value={theme}
            onValueChange={(value) => setTheme(value as Theme)}
          >
            {OPTIONS.map(({ value, icon: Icon }) => (
              <DropdownMenu.RadioItem
                key={value}
                value={value}
                className="relative flex cursor-default select-none items-center gap-2.5 rounded-sm py-1.5 pl-2.5 pr-8 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{labels[value]}</span>
                <DropdownMenu.ItemIndicator className="absolute right-2.5">
                  <Check className="h-4 w-4 text-primary" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
