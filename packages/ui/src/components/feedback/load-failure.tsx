import { Button } from "../forms/button";
import type { Icon } from "../shared/icon";
import { InlineNotice } from "./inline-notice";

export type LoadFailureProps = {
  icon: Icon;
  title: string;
  description: string;
  onRetry: () => void;
};

export function LoadFailure({ icon, title, description, onRetry }: LoadFailureProps) {
  return (
    <div className="flex flex-col items-start gap-4">
      <InlineNotice tone="error" icon={icon} title={title} description={description} />
      <Button variant="secondary" onPress={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}
