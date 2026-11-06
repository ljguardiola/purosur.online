import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { CompromiseResponseScreen } from "./compromise-response-screen";
import { defaultCompromiseResponseScreenServices } from "./compromise-response-services";

const route = getRouteApi("/signed-in/settings-area/people");

export function CompromiseResponsePage({ onClose }: { onClose: () => void }): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  return (
    <CompromiseResponseScreen
      onClose={onClose}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.compromiseResponseScreen ?? defaultCompromiseResponseScreenServices}
    />
  );
}
