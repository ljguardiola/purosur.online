import type { Meta, StoryObj } from "@storybook/react-vite";
import { KeyRound, Lock, UsersRound } from "lucide-react";
import { InlineNotice } from "../feedback/inline-notice";
import { LoadingPlaceholder } from "../feedback/loading-placeholder";
import { Button } from "../forms/button";
import { CardPanel } from "./card-panel";

const meta: Meta<typeof CardPanel> = {
  title: "Components/CardPanel",
  component: CardPanel,
};

export default meta;

type Story = StoryObj<typeof CardPanel>;

export const Untitled: Story = {
  args: {
    children: (
      <>
        <p className="text-body text-text">Contenido de la tarjeta.</p>
        <Button fullWidth keycap="Enter">
          Entrar
        </Button>
      </>
    ),
  },
};

export const Titled: Story = {
  args: {
    icon: <UsersRound />,
    title: "¿Quién abre la caja?",
    children: <LoadingPlaceholder variant="list" items={3} />,
  },
};

export const WithEscapeKeycap: Story = {
  args: {
    icon: <Lock />,
    title: "Lucas está bloqueado",
    escapeKeycap: true,
    children: (
      <>
        <p className="text-body text-text">Se equivocó 8 veces seguidas con el PIN.</p>
        <InlineNotice
          tone="warning"
          icon={<KeyRound />}
          title="Se vuelve a entrar con un código"
          description="Alguien con permiso lo genera desde el backoffice."
        />
        <Button fullWidth icon={<KeyRound />} iconPosition="start" keycap="F3">
          Tengo un código
        </Button>
      </>
    ),
  },
};

export const WithEyebrow: Story = {
  args: {
    icon: <KeyRound />,
    title: "PIN nuevo guardado",
    eyebrow: "Lucas",
    escapeKeycap: true,
    children: (
      <Button fullWidth keycap="Enter">
        Volver al inicio
      </Button>
    ),
  },
};
