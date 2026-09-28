import { createRoute, lazyRouteComponent, redirect } from "@tanstack/react-router";
import { helpAreaRoute } from "../shell/help-area";
import {
  type BackofficeHelpCatalog,
  canonicalHelpPage,
  isRequestedPage,
  type RequestedHelpPage,
} from "./help-catalog";

function refuseNonCanonical(help: BackofficeHelpCatalog, requested: RequestedHelpPage): void {
  const page = canonicalHelpPage(help, requested);
  if (isRequestedPage(page, requested)) {
    return;
  }
  if (page.articleId !== null) {
    throw redirect({
      to: "/help/$categoryId/$articleId",
      params: { categoryId: page.categoryId, articleId: page.articleId },
    });
  }
  if (page.categoryId !== null) {
    throw redirect({ to: "/help/$categoryId", params: { categoryId: page.categoryId } });
  }
  throw redirect({ to: "/help" });
}

const helpPage = lazyRouteComponent(() => import("./help-page"), "HelpPage");

export const helpHomeRoute = createRoute({
  getParentRoute: () => helpAreaRoute,
  path: "/",
  component: helpPage,
});

export const helpCategoryRoute = createRoute({
  getParentRoute: () => helpAreaRoute,
  path: "$categoryId",
  beforeLoad: ({ context: { help }, params }) => refuseNonCanonical(help, params),
  component: helpPage,
});

export const helpArticleRoute = createRoute({
  getParentRoute: () => helpAreaRoute,
  path: "$categoryId/$articleId",
  beforeLoad: ({ context: { help }, params }) => refuseNonCanonical(help, params),
  component: helpPage,
});
