import { DetailPanel, Tab, Tabs } from "@purosur/ui";
import { createLink, getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { OwnCredentialsSection } from "../credentials/own-credentials-section";
import { defaultOwnCredentialsSectionServices } from "../credentials/own-credentials-section-services";
import { landingPart, type PagePart, pagePartsFor } from "../platform/page-parts";
import { OwnUserData } from "../users/own-user-data";
import { defaultUserPanelServices } from "../users/user-panel-services";
import { type BackofficeAccess, canSeeUsersArea } from "./backoffice-access";

const route = getRouteApi("/signed-in");

const OwnAccountTabLink = createLink(Tab);

type OwnAccountTab = "data" | "credentials";

const OWN_ACCOUNT_TABS: readonly PagePart<BackofficeAccess, OwnAccountTab>[] = [
  { key: "data", isVisibleTo: canSeeUsersArea },
  { key: "credentials", isVisibleTo: () => true },
];

export type OwnAccountPanelProps = {
  tab: string;
  onClose: () => void;
};

export function OwnAccountPanel({ tab, onClose }: OwnAccountPanelProps): ReactElement {
  const { session, services, sessionActions } = route.useRouteContext();
  const parts = pagePartsFor(session, OWN_ACCOUNT_TABS);
  const visible = parts.kind === "shown" ? parts.visible : [];
  const selectedTab = parts.kind === "shown" ? landingPart(parts, tab) : "credentials";
  return (
    <DetailPanel open onClose={onClose} recordKey={session.userId} title={session.displayName}>
      <Tabs
        label="Secciones de tu cuenta"
        selectedTab={selectedTab}
        tabs={visible.map((key) => (
          <OwnAccountTabLink
            key={key}
            to="."
            search={(previous) => ({ ...previous, account: key })}
            value={key}
            label={key === "data" ? "Datos" : "Passkeys y PIN"}
          />
        ))}
      >
        <div className="pt-4">
          {selectedTab === "data" ? (
            <OwnUserData
              userId={session.userId}
              onSessionEnded={sessionActions.sessionEnded}
              services={services.userPanel ?? defaultUserPanelServices}
            />
          ) : (
            <OwnCredentialsSection
              displayName={session.displayName}
              userId={session.userId}
              access={session}
              onSessionEnded={sessionActions.sessionEnded}
              services={services.ownCredentialsSection ?? defaultOwnCredentialsSectionServices}
            />
          )}
        </div>
      </Tabs>
    </DetailPanel>
  );
}
