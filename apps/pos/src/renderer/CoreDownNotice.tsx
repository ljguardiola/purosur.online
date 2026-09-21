import { messages } from "../messages";
import { BrandPanelScreen } from "./BrandPanelScreen";

export function CoreDownNotice() {
  return (
    <BrandPanelScreen>
      <div role="alert" className="flex w-full max-w-md flex-col gap-4">
        <p className="text-3xl font-bold text-brand-blue-strong">{messages.coreDown.title}</p>
        <p className="text-base leading-[1.35] text-ink-secondary">{messages.coreDown.body}</p>
      </div>
    </BrandPanelScreen>
  );
}
