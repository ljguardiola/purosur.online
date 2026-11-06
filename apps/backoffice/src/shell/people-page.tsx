import { Button, Tab, Tabs } from "@purosur/ui";
import {
  createLink,
  getRouteApi,
  Outlet,
  useMatchRoute,
  useNavigate,
} from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { type ReactElement, Suspense } from "react";
import { pagePartsFor } from "../platform/page-parts";
import { canManageUsers } from "./backoffice-access";
import { useDocumentTitle } from "./document-title";
import { lazyScreen } from "./lazy-screen";
import { PEOPLE_TABS, type PeopleTab } from "./people-route";
import { ScreenLayout } from "./screen-layout";
import { ScreenTitle } from "./screen-title";

const route = getRouteApi("/signed-in/settings-area/people");

const PeopleTabLink = createLink(Tab);

const CompromiseResponseAssistant = lazyScreen(
  () => import("../sessions/compromise-response-page"),
  "CompromiseResponsePage",
);

const TAB_LABELS: Record<PeopleTab, string> = { users: "Usuarios", roles: "Roles" };

export function PeoplePage(): ReactElement {
  const { session } = route.useRouteContext();
  const { assistant } = route.useSearch();
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  useDocumentTitle("Personas · Puro Sur");
  const parts = pagePartsFor(session, PEOPLE_TABS);
  const visible = parts.kind === "shown" ? parts.visible : [];
  const selectedTab: PeopleTab = matchRoute({ to: "/people/roles" }) ? "roles" : "users";

  return (
    <>
      <ScreenLayout
        topBar={
          <div className="flex h-18 shrink-0 items-center justify-between border-border border-b bg-surface px-8">
            <div className="flex flex-col justify-center">
              <p className="text-text-subtle text-detail">Configuración</p>
              <ScreenTitle>Personas</ScreenTitle>
            </div>
            {canManageUsers(session) ? (
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
            ) : null}
          </div>
        }
        bodyClassName="p-0"
      >
        <Tabs
          label="Secciones de Personas"
          selectedTab={selectedTab}
          tabs={visible.map((key) => (
            <PeopleTabLink
              key={key}
              to={key === "users" ? "/people/users" : "/people/roles"}
              search={key === selectedTab ? true : {}}
              value={key}
              label={TAB_LABELS[key]}
            />
          ))}
        >
          <Outlet />
        </Tabs>
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
