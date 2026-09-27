import { createRoute, Outlet, useParams } from "@tanstack/react-router";
import { HelpSectionColumn } from "../help/help-screen";
import { AreaLayout } from "./area-layout";
import { signedInRoute } from "./signed-in-route";

export const helpAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "help",
  component: HelpArea,
});

function HelpArea() {
  const { help } = helpAreaRoute.useRouteContext();
  const { categoryId } = useParams({ strict: false });
  return (
    <AreaLayout
      area="help"
      sectionColumnLabel="Secciones de ayuda"
      sectionColumn={<HelpSectionColumn help={help} activeCategoryId={categoryId ?? null} />}
    >
      <Outlet />
    </AreaLayout>
  );
}
