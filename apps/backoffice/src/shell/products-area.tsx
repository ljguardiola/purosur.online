import { createRoute, Outlet } from "@tanstack/react-router";
import { AreaLayout } from "./area-layout";
import { signedInRoute } from "./signed-in-route";

export const productsAreaRoute = createRoute({
  getParentRoute: () => signedInRoute,
  id: "products-area",
  component: ProductsArea,
});

function ProductsArea() {
  return (
    <AreaLayout area="products">
      <Outlet />
    </AreaLayout>
  );
}
