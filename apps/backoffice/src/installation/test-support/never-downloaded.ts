import type { ReactNode } from "react";
import { lazyScreen } from "../../shell/lazy-screen";

export function neverDownloaded<TProps>() {
  return lazyScreen(() => new Promise<{ default: (props: TProps) => ReactNode }>(() => {}));
}
