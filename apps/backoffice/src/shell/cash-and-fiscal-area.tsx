import { createRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { FileText, ListChecks, Percent, Receipt, SlidersHorizontal } from "lucide-react";
import { AreaLayout, SectionLink } from "./area-layout";
import { canSeeFiscalConfigurationArea, canSeeFiscalInformation } from "./backoffice-access";
import { signedInRoute } from "./signed-in-route";

export const cashAndFiscalAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "cash-and-fiscal-area",
  component: CashAndFiscalArea,
});

function CashAndFiscalArea() {
  const { session } = signedInRoute.useRouteContext();
  const matchRoute = useMatchRoute();
  const fiscalTasksShown = Boolean(matchRoute({ to: "/fiscal-tasks" }));
  const issuedDocumentsShown = Boolean(matchRoute({ to: "/fiscal-documents" }));
  const exceptionalityShown = Boolean(matchRoute({ to: "/exceptionality" }));
  const pointsOfSaleShown = Boolean(matchRoute({ to: "/points-of-sale" }));
  const fiscalSettingsShown = Boolean(matchRoute({ to: "/fiscal-settings" }));
  return (
    <AreaLayout
      area="cash-and-fiscal"
      sectionColumnLabel="Caja y fiscal"
      sectionColumn={
        <>
          <h2 className="text-text-accent text-heading">Caja y fiscal</h2>
          <div className="h-2.5" />
          {canSeeFiscalInformation(session) && (
            <>
              <p className="px-3 pt-3 pb-1 font-bold text-text-subtle text-caption tracking-xs">
                TAREAS
              </p>
              <ul className="flex flex-col gap-1">
                <li>
                  <SectionLink
                    to="/fiscal-tasks"
                    label="Tareas fiscales"
                    icon={<ListChecks />}
                    active={fiscalTasksShown}
                  />
                </li>
              </ul>
            </>
          )}
          {(canSeeFiscalInformation(session) || canSeeFiscalConfigurationArea(session)) && (
            <>
              <p className="px-3 pt-3 pb-1 font-bold text-text-subtle text-caption tracking-xs">
                FISCAL
              </p>
              <ul className="flex flex-col gap-1">
                {canSeeFiscalInformation(session) && (
                  <li>
                    <SectionLink
                      to="/fiscal-documents"
                      label="Comprobantes"
                      icon={<FileText />}
                      active={issuedDocumentsShown}
                    />
                  </li>
                )}
                {canSeeFiscalInformation(session) && (
                  <li>
                    <SectionLink
                      to="/exceptionality"
                      label="Excepcionalidad"
                      icon={<Percent />}
                      active={exceptionalityShown}
                    />
                  </li>
                )}
                {canSeeFiscalConfigurationArea(session) && (
                  <>
                    <li>
                      <SectionLink
                        to="/points-of-sale"
                        label="Puntos de venta"
                        icon={<Receipt />}
                        active={pointsOfSaleShown}
                      />
                    </li>
                    <li>
                      <SectionLink
                        to="/fiscal-settings"
                        label="Configuración fiscal"
                        icon={<SlidersHorizontal />}
                        active={fiscalSettingsShown}
                      />
                    </li>
                  </>
                )}
              </ul>
            </>
          )}
        </>
      }
    >
      <Outlet />
    </AreaLayout>
  );
}
