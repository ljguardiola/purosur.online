import { createRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import {
  FileText,
  HandCoins,
  Landmark,
  ListChecks,
  Receipt,
  SlidersHorizontal,
} from "lucide-react";
import { AreaLayout, SectionLink } from "./area-layout";
import { canSeeCashArea, canSeeFiscalInformation, canSeeRefundsArea } from "./backoffice-access";
import { signedInRoute } from "./signed-in-route";

export const cashAndFiscalAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "cash-and-fiscal-area",
  component: CashAndFiscalArea,
});

function CashAndFiscalArea() {
  const { session } = signedInRoute.useRouteContext();
  const matchRoute = useMatchRoute();
  const mercadoPagoRefundsShown = Boolean(matchRoute({ to: "/refunds/mercado-pago" }));
  const outsideRefundsShown = Boolean(matchRoute({ to: "/refunds/outside-the-system" }));
  const fiscalTasksShown = Boolean(matchRoute({ to: "/fiscal-tasks" }));
  const issuedDocumentsShown = Boolean(matchRoute({ to: "/fiscal-documents" }));
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
          {(canSeeRefundsArea(session) || canSeeFiscalInformation(session)) && (
            <>
              <p className="px-3 pt-3 pb-1 font-bold text-text-subtle text-caption tracking-xs">
                TAREAS
              </p>
              <ul className="flex flex-col gap-1">
                {canSeeRefundsArea(session) && (
                  <>
                    <li>
                      <SectionLink
                        to="/refunds/mercado-pago"
                        label="Reembolsos de MP"
                        icon={<HandCoins />}
                        active={mercadoPagoRefundsShown}
                      />
                    </li>
                    <li>
                      <SectionLink
                        to="/refunds/outside-the-system"
                        label="Reembolsos sin API"
                        icon={<Landmark />}
                        active={outsideRefundsShown}
                      />
                    </li>
                  </>
                )}
                {canSeeFiscalInformation(session) && (
                  <li>
                    <SectionLink
                      to="/fiscal-tasks"
                      label="Tareas fiscales"
                      icon={<ListChecks />}
                      active={fiscalTasksShown}
                    />
                  </li>
                )}
              </ul>
            </>
          )}
          {(canSeeFiscalInformation(session) || canSeeCashArea(session)) && (
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
                {canSeeCashArea(session) && (
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
