import type { ReactNode } from "react";
import { HankoSeal } from "./HankoSeal";
import { EyebrowIndex } from "./EyebrowIndex";

type Props = {
  index: string;
  title: string;
  updated: string;
  children: ReactNode;
};

/** A single cream "print" laid on the indigo canvas. */
export function LegalPrint({ index, title, updated, children }: Props) {
  return (
    <main className="mx-auto max-w-[1320px] px-4 sm:px-8 lg:px-14 py-20 md:py-28">
      <article className="paper-grain relative bg-indigo text-bone keyblock-sumi">
        <div className="px-5 sm:px-8 md:px-16 lg:px-24 py-16 md:py-24 relative z-10">
          <EyebrowIndex index={index} label={`Updated ${updated}`} tone="ochre" />
          <h1 className="mt-6 text-4xl sm:text-5xl md:text-7xl font-semibold tracking-[-0.035em] leading-[0.96] break-words hyphens-auto">
            {title}
          </h1>

          <div className="mt-14 grid grid-cols-12 gap-8 prose-print">
            <div className="col-span-12 md:col-span-8 md:col-start-3 space-y-10 text-[15px] leading-[1.7] break-words [&_code]:break-all [&_a]:break-words">
              {children}
            </div>
          </div>

          <div className="mt-24 flex items-end justify-between">
            <div className="mono text-xs uppercase tracking-[0.2em] text-bone-mute">
              Chara · Stockholm
            </div>
            <HankoSeal size={56} />
          </div>
        </div>
      </article>
    </main>
  );
}
