import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "./document-title";
import { HomeScreen } from "./home-screen";

const route = getRouteApi("/signed-in/home-area/");

export function HomePage(): ReactElement {
  const { session, services, sessionActions } = route.useRouteContext();
  useDocumentTitle("Inicio · Puro Sur");
  return (
    <HomeScreen access={session} onSessionEnded={sessionActions.sessionEnded} services={services} />
  );
}
