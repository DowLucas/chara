/**
 * App Store + Google Play download badges.
 * Hand-built to match the official "Download on the App Store" and
 * "Get it on Google Play" lock-ups: black pill, white logo + text,
 * thin white hairline. Linked to the live Chara store listings.
 */

export const APP_STORE_URL =
  "https://apps.apple.com/se/app/chara-split-bills/id6773089720?l=en-GB";
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=chara.app";

type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, { h: string; pad: string; mark: number; small: string; large: string }> = {
  sm: { h: "h-10", pad: "px-3", mark: 20, small: "text-[8px]",  large: "text-[13px]" },
  md: { h: "h-12", pad: "px-4", mark: 24, small: "text-[9px]",  large: "text-[15px]" },
  lg: { h: "h-14", pad: "px-5", mark: 28, small: "text-[10px]", large: "text-[17px]" },
};

function BadgeShell({
  href,
  ariaLabel,
  size,
  mark,
  small,
  large,
}: {
  href: string;
  ariaLabel: string;
  size: Size;
  mark: React.ReactNode;
  small: string;
  large: string;
}) {
  const s = SIZE[size];
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className={`group inline-flex ${s.h} ${s.pad} items-center gap-3 rounded-[10px] bg-[#000] text-white border border-white/30 hover:border-white transition-colors leading-none select-none`}
    >
      <span aria-hidden="true" className="shrink-0">{mark}</span>
      <span className="flex flex-col items-start gap-[2px]">
        <span className={`${s.small} tracking-wide opacity-90`}>{small}</span>
        <span
          className={`${s.large} font-medium tracking-[-0.01em]`}
          style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
        >
          {large}
        </span>
      </span>
    </a>
  );
}

export function AppStoreBadge({ size = "md" }: { size?: Size }) {
  const px = SIZE[size].mark;
  return (
    <BadgeShell
      href={APP_STORE_URL}
      ariaLabel="Download Chara on the App Store"
      size={size}
      small="Download on the"
      large="App Store"
      mark={
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width={px}
          height={px}
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M16.365 1.43c0 1.14-.46 2.22-1.21 3.02-.78.82-2.06 1.46-3.13 1.37-.13-1.1.41-2.25 1.13-3 .82-.86 2.2-1.5 3.21-1.39zM20.5 17.27c-.55 1.27-.82 1.84-1.53 2.96-.99 1.57-2.39 3.52-4.12 3.54-1.54.02-1.93-1-4.02-.98-2.08.01-2.51 1-4.05.97-1.73-.03-3.06-1.78-4.04-3.35C.07 16.16-.22 11.04 2.42 8.32c1.14-1.17 2.93-1.91 4.62-1.91 1.72 0 2.8.93 4.23.93 1.38 0 2.22-.93 4.21-.93 1.51 0 3.11.82 4.25 2.24-3.74 2.05-3.13 7.4.77 8.62z" />
        </svg>
      }
    />
  );
}

export function GooglePlayBadge({ size = "md" }: { size?: Size }) {
  const px = SIZE[size].mark;
  return (
    <BadgeShell
      href={PLAY_STORE_URL}
      ariaLabel="Get Chara on Google Play"
      size={size}
      small="GET IT ON"
      large="Google Play"
      mark={
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 512 512"
          width={px}
          height={px}
          aria-hidden="true"
        >
          {/* Four-color Google Play triangle */}
          <path fill="#00C3FF" d="M59 27c-7 4-11 12-11 22v402c0 10 4 18 11 22l232-223L59 27z" />
          <path fill="#FFCE00" d="M376 256l-66-63-43 41 43 41 66-63z" transform="translate(0 -22)" />
          <path fill="#00F076" d="M291 250L59 27c5-3 11-3 18 1l277 158-63 64z" />
          <path fill="#FF3A44" d="M291 250l63 64-277 158c-7 4-13 4-18 1l232-223z" />
        </svg>
      }
    />
  );
}

export function StoreBadges({
  size = "md",
  className = "",
}: {
  size?: Size;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <AppStoreBadge size={size} />
      <GooglePlayBadge size={size} />
    </div>
  );
}
