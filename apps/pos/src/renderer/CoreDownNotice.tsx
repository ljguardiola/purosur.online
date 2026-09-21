import { messages } from "../messages";

// Full-screen split layout from design.pen's "Caja / Núcleo que no vuelve a arrancar" (node
// rWjoZ): a brand panel on the left, the message centered on the right. The design's brand panel
// also carries the Puro Sur logo and a branch/cashier footer, and its message carries a "CAJA 1"
// eyebrow; none of that ships here because the register doesn't know its branch, cashier, or
// clock yet, and there is no logo asset in this repository to place without inventing one — only
// the panel split and the message block are built, from existing design tokens.
export function CoreDownNotice() {
  return (
    <div className="flex h-screen w-screen bg-surface-white">
      <div className="hidden w-2/5 min-w-80 bg-surface-sand md:block" />
      <div className="flex flex-1 items-center justify-center p-8">
        <div role="alert" className="flex w-full max-w-md flex-col gap-4 text-center md:text-left">
          <p className="text-3xl font-bold text-brand-blue-strong">{messages.coreDown.title}</p>
          <p className="text-base leading-[1.35] text-ink-secondary">{messages.coreDown.body}</p>
        </div>
      </div>
    </div>
  );
}
