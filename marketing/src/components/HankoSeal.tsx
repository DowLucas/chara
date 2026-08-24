import hankoLogo from "@/assets/chara-hanko.png";

type Props = {
  size?: number;
  label?: string;
  className?: string;
};

/**
 * Hanko — the artist's chop. Bottom-right of every section.
 * Hand-carved vermillion CHARA mark. Never animates.
 */
export function HankoSeal({ size = 44, label = "CHARA", className = "" }: Props) {
  return (
    <img
      src={hankoLogo}
      alt={label}
      className={`inline-block select-none ${className}`}
      style={{ height: size, width: "auto", objectFit: "contain" }}
      draggable={false}
    />
  );
}
