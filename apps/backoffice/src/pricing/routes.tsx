import { createRoute, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { canSeePricesArea } from "../access/backoffice-access";
import { catalogAreaRoute } from "../shell/catalog-area";
import { useDocumentTitle } from "../shell/document-title";
import { refuseWithout } from "../shell/signed-in-route";
import { PricesListScreen } from "./prices-list-screen";

export const pricesListFilters = z.object({
  search: z.string().default("").catch(""),
  category: z.string().default("ALL").catch("ALL"),
  review: z.enum(["pending", "all"]).default("pending").catch("pending"),
});

export type PricesListFilters = z.output<typeof pricesListFilters>;

export const pricesListRoute = createRoute({
  getParentRoute: () => catalogAreaRoute,
  path: "prices",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeePricesArea),
  validateSearch: pricesListFilters,
  search: { middlewares: [stripSearchParams(pricesListFilters.parse({}))] },
  component: PricesListPage,
});

function PricesListPage() {
  const { services, sessionActions } = pricesListRoute.useRouteContext();
  const filters = pricesListRoute.useSearch();
  const navigate = pricesListRoute.useNavigate();
  useDocumentTitle("Precios · Puro Sur");
  return (
    <PricesListScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.pricesListScreen}
    />
  );
}
