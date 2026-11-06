import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { RespondToCompromiseModal } from "./respond-to-compromise-modal";
import { defaultRespondToCompromiseModalServices } from "./respond-to-compromise-modal-services";

const route = getRouteApi("/signed-in/settings-area/people");

export function CompromiseResponseAssistant({ onClose }: { onClose: () => void }): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  return (
    <RespondToCompromiseModal
      onClose={onClose}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.respondToCompromiseModal ?? defaultRespondToCompromiseModalServices}
    />
  );
}
