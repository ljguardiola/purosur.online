import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "./document-title";
import { HomeScreen } from "./home-screen";
import { defaultHomeScreenServices } from "./home-screen-services";

const route = getRouteApi("/signed-in/home-area/");

export function HomePage(): ReactElement {
  const { session, services, sessionActions } = route.useRouteContext();
  useDocumentTitle("Inicio · Puro Sur");
  return (
    <HomeScreen
      access={session}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.homeScreen ?? defaultHomeScreenServices}
    />
  );
}
