/** Kentō — the registration cross used once in the footer corner. */
export function RegistrationMark({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      className={`text-bone/40 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      <circle cx="12" cy="12" r="6" />
      <line x1="12" y1="0" x2="12" y2="24" />
      <line x1="0" y1="12" x2="24" y2="12" />
    </svg>
  );
}
