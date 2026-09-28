import { getRouteApi, useParams } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { HelpScreen } from "./help-screen";

const route = getRouteApi("/signed-in/help");

export function HelpPage(): ReactElement {
  const { help } = route.useRouteContext();
  const { categoryId, articleId } = useParams({ strict: false });
  return <HelpScreen help={help} categoryId={categoryId ?? null} articleId={articleId ?? null} />;
}
