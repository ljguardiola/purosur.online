import { ButtonLink, EmptyState } from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import { Home, MapPinOff } from "lucide-react";
import type { ReactElement } from "react";
import { AreaTopBar } from "./area-top-bar";
import { useDocumentTitle } from "./document-title";
import { ScreenLayout } from "./screen-layout";

const HomeLink = createLink(ButtonLink);

export function NotFoundPage(): ReactElement {
  useDocumentTitle("Página no encontrada · Puro Sur");
  return (
    <ScreenLayout topBar={<AreaTopBar title="Página no encontrada" />} bodyClassName="p-8">
      <EmptyState
        icon={<MapPinOff />}
        title="Revisá el enlace"
        description="Puede estar mal escrito o llevar a una pantalla que ya no existe."
        variant="blank"
        actions={
          <HomeLink to="/" variant="text" icon={<Home />}>
            Ir a Inicio
          </HomeLink>
        }
      />
    </ScreenLayout>
  );
}
