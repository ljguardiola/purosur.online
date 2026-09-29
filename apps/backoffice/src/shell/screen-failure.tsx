import { Button, InlineNotice } from "@purosur/ui";
import { type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ScreenDownloadFailure } from "./lazy-screen";
import { ScreenLayout } from "./screen-layout";
import { ScreenPending } from "./screen-pending";
import { focusScreenTitle, ScreenTitle } from "./screen-title";

export type ScreenFailureServices = {
  isOnline: () => boolean;
  reloadPage: () => void;
};

export const defaultScreenFailureServices: ScreenFailureServices = {
  isOnline: () => navigator.onLine,
  reloadPage: () => window.location.reload(),
};

// The browser remembers a module that failed to download until the page reloads, so only a
// reload can fetch it again.
function claimReloadFor(module: string): boolean {
  const key = `purosur-backoffice-reloaded-for:${module}`;
  try {
    if (window.sessionStorage.getItem(key) !== null) {
      return false;
    }
    window.sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return false;
  }
}

export function ScreenFailure({ error }: ErrorComponentProps) {
  const router = useRouter();
  const { services, reportError } = router.options.context;
  const { isOnline, reloadPage } = services.screenFailure;
  const downloadFailure = error instanceof ScreenDownloadFailure ? error : null;
  const [reloading, setReloading] = useState(downloadFailure !== null);
  const [offlineOnRetry, setOfflineOnRetry] = useState(false);
  const handledFailure = useRef<ScreenDownloadFailure | null>(null);

  useEffect(() => {
    if (downloadFailure === null) {
      setReloading(false);
      return;
    }
    if (handledFailure.current === downloadFailure) {
      return;
    }
    handledFailure.current = downloadFailure;
    if (isOnline()) {
      if (claimReloadFor(downloadFailure.module)) {
        reloadPage();
        return;
      }
      reportError(downloadFailure);
    }
    setReloading(false);
  }, [downloadFailure, isOnline, reloadPage, reportError]);

  useEffect(() => {
    if (!reloading) {
      focusScreenTitle();
    }
  }, [reloading]);

  if (reloading) {
    return <ScreenPending />;
  }

  const retry = async () => {
    if (downloadFailure !== null) {
      if (isOnline()) {
        claimReloadFor(downloadFailure.module);
        reloadPage();
      } else {
        setOfflineOnRetry(true);
      }
      return;
    }
    await router.invalidate();
    focusScreenTitle();
  };
  return (
    <ScreenLayout
      topBar={
        <div className="flex h-18 shrink-0 items-center border-border border-b bg-surface px-8">
          <ScreenTitle>No pudimos mostrar esta pantalla</ScreenTitle>
        </div>
      }
      bodyClassName="gap-4 p-6"
    >
      <InlineNotice
        tone="error"
        icon={<TriangleAlert />}
        description={
          offlineOnRetry
            ? "Revisá la conexión a internet y probá de nuevo."
            : "Probá de nuevo en unos minutos."
        }
      />
      <Button variant="secondary" onPress={() => void retry()}>
        Reintentar
      </Button>
    </ScreenLayout>
  );
}
