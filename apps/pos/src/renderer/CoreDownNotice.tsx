import { PuroSurLogo } from "@purosur/ui";
import { messages } from "../messages";

// Full-screen split layout from design.pen's "Caja / Núcleo que no vuelve a arrancar" (node
// rWjoZ): a brand panel on the left (its logo sized to the design's own 420x164 box, node POQGo),
// the message centered on the right. The design's brand panel also carries a branch/cashier
// footer, and its message carries a "CAJA 1" eyebrow; neither ships here because the register
// doesn't know its branch, cashier, or clock yet.
export function CoreDownNotice() {
  return (
    <div className="flex h-screen w-screen bg-surface-white">
      <div className="flex w-2/5 min-w-80 items-center justify-center bg-surface-sand">
        <PuroSurLogo alt={messages.brand.logoAlt} className="h-[164px] w-[420px] object-contain" />
      </div>
      <div className="flex flex-1 items-center justify-center p-8">
        <div role="alert" className="flex w-full max-w-md flex-col gap-4">
          <p className="text-3xl font-bold text-brand-blue-strong">{messages.coreDown.title}</p>
          <p className="text-base leading-[1.35] text-ink-secondary">{messages.coreDown.body}</p>
        </div>
      </div>
    </div>
  );
}
