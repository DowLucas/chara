type Props = {
  index: string;
  label?: string;
  tone?: "ochre" | "bone";
};

export function EyebrowIndex({ index, label, tone = "ochre" }: Props) {
  const color = tone === "ochre" ? "text-ochre" : "text-bone-mute";
  return (
    <div className={`mono text-xs ${color} flex items-center gap-3 uppercase tracking-[0.18em]`}>
      <span className="tabular-nums">{index}</span>
      {label ? (
        <>
          <span aria-hidden="true" className="h-px w-8 bg-current opacity-60" />
          <span>{label}</span>
        </>
      ) : null}
    </div>
  );
}
