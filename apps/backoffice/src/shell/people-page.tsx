import { Button } from "@purosur/ui";
import { getRouteApi, Outlet, useMatchRoute, useNavigate } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { type ReactElement, Suspense } from "react";
import { AreaTabs } from "./area-tabs";
import { AreaTopBar } from "./area-top-bar";
import { canManageUsers } from "./backoffice-access";
import { useDocumentTitle } from "./document-title";
import { lazyScreen } from "./lazy-screen";
import type { PeopleTab } from "./people-tabs";
import { ScreenLayout } from "./screen-layout";

const route = getRouteApi("/signed-in/settings-area/people");

const CompromiseResponseAssistant = lazyScreen(
  () => import("../sessions/compromise-response-assistant"),
  "CompromiseResponseAssistant",
);

export function PeoplePage(): ReactElement {
  const { session, settingsTabs } = route.useRouteContext();
  const { assistant } = route.useSearch();
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  useDocumentTitle("Personas · Puro Sur");
  const selectedTab: PeopleTab = matchRoute({ to: "/people/roles" }) ? "roles" : "users";

  return (
    <>
      <ScreenLayout
        topBar={
          <AreaTopBar
            title="Configuración"
            action={
              canManageUsers(session) ? (
                <Button
                  variant="secondary"
                  icon={<ShieldAlert />}
                  onPress={() =>
                    void navigate({
                      to: ".",
                      search: (previous) => ({ ...previous, assistant: "compromise-response" }),
                    })
                  }
                >
                  Ante una sospecha de compromiso
                </Button>
              ) : null
            }
          />
        }
        bodyClassName="p-0"
      >
        <AreaTabs area="Configuración" tabs={settingsTabs} selected={selectedTab}>
          <Outlet />
        </AreaTabs>
      </ScreenLayout>
      {assistant === undefined ? null : (
        <Suspense fallback={null}>
          <CompromiseResponseAssistant
            onClose={() =>
              void navigate({
                to: ".",
                search: (previous) => ({ ...previous, assistant: undefined }),
              })
            }
          />
        </Suspense>
      )}
    </>
  );
}
