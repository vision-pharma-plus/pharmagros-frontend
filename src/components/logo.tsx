import Image from "next/image";

import { cn } from "@/lib/utils";

/** Brand name carried by the wordmark in the logo files. */
export const BRAND_NAME = "Vision Pharma plus";

/** Intrinsic size of the wordmark files, used to keep the aspect ratio exact. */
const WORDMARK = { width: 552, height: 238 };

/**
 * Brand wordmark.
 *
 * Both variants are rendered and swapped with CSS on the `dark` class rather
 * than picked in JavaScript. The theme is applied by a pre-hydration script and
 * "system" follows the OS, so a JS-side choice would either flash the wrong
 * variant before hydration or disagree with the server render.
 */
export function Logo({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  // The wordmark is never wider than its container and keeps its ratio.
  const imageClass = "h-full w-auto object-contain";

  return (
    <span className={cn("inline-flex items-center", className)}>
      <Image
        src="/logo-light.png"
        alt={BRAND_NAME}
        width={WORDMARK.width}
        height={WORDMARK.height}
        priority={priority}
        className={cn(imageClass, "dark:hidden")}
      />
      {/* Same wordmark, light-on-dark. Decorative: the variant above already
          supplies the accessible name, and both are always in the DOM. */}
      <Image
        src="/logo-dark.png"
        alt=""
        aria-hidden
        width={WORDMARK.width}
        height={WORDMARK.height}
        priority={priority}
        className={cn(imageClass, "hidden dark:block")}
      />
    </span>
  );
}

/**
 * Square mark without the wordmark, for tight spots where the full logo would
 * have to shrink past legibility.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/favicon.png"
      alt=""
      aria-hidden
      width={234}
      height={233}
      className={cn("object-contain", className)}
    />
  );
}
