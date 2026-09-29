import { LoadingPlaceholder } from "@purosur/ui";
import { ScreenLayout } from "./screen-layout";

export function ScreenPending() {
  return (
    <ScreenLayout
      topBar={<div className="h-18 shrink-0 border-border border-b bg-surface" />}
      bodyClassName="gap-4 p-6"
    >
      <LoadingPlaceholder variant="list" items={4} />
    </ScreenLayout>
  );
}
