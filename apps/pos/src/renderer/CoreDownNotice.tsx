import { PuroSurLogo } from "@purosur/ui";
import { messages } from "../messages";

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
