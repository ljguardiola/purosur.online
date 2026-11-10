import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlertTriangle, CheckCircle, Info, XCircle } from "lucide-react";
import { expect, userEvent, within } from "storybook/test";
import {
  playHoverShowsNameTooltip,
  playTabShowsNameTooltip,
} from "../../test-support/story-interactions";
import { Button } from "../forms/button";
import { Modal } from "./modal";

const meta: Meta<typeof Modal> = {
  title: "Components/Modal",
  component: Modal,
  args: {
    open: true,
    onOpenChange: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof Modal>;

export const Leading: Story = {
  args: {
    tone: "info",
    icon: <Info />,
    title: "Anular la venta",
    children: "¿Estás seguro de que querés anular esta venta?",
    footer: (
      <>
        <Button variant="secondary">Cancelar</Button>
        <Button destructive>Anular</Button>
      </>
    ),
  },
};

export const Centered: Story = {
  args: {
    headerLayout: "centered",
    tone: "success",
    icon: <CheckCircle />,
    title: "Venta completada",
    children: "El comprobante se envió a la impresora.",
    footer: <Button fullWidth>Aceptar</Button>,
  },
};

export const WithContext: Story = {
  args: {
    tone: "warning",
    icon: <AlertTriangle />,
    context: "Advertencia",
    title: "Stock bajo",
    children: "Quedan menos de 5 unidades de este producto.",
    footer: <Button>Entendido</Button>,
  },
};

export const ErrorTone: Story = {
  args: {
    tone: "error",
    icon: <XCircle />,
    title: "El pago falló",
    children: "La tarjeta fue rechazada por el banco.",
    footer: <Button destructive>Reintentar</Button>,
  },
};

export const NoBodyPadding: Story = {
  args: {
    tone: "info",
    icon: <Info />,
    title: "Editor de producto",
    bodyPadding: "none",
    children: <div style={{ padding: 24 }}>Contenido a pantalla completa, sin margen propio.</div>,
    footer: <Button>Guardar</Button>,
  },
};

export const Wide: Story = {
  args: {
    width: "wide",
    tone: "info",
    icon: <Info />,
    title: "Editar producto",
    children: "Formulario con más espacio horizontal.",
    footer: <Button>Guardar</Button>,
  },
};

export const Closable: Story = {
  args: {
    tone: "info",
    icon: <Info />,
    title: "Detalle del producto",
    closable: true,
    children: "Podés cerrar este modal con el botón o con Escape.",
    footer: <Button>Entendido</Button>,
  },
  play: playTabShowsNameTooltip(
    () => within(document.body).getByRole("button", { name: "Cerrar" }),
    "Cerrar",
  ),
};

export const CloseButtonHovered: Story = {
  args: {
    tone: "info",
    icon: <Info />,
    title: "Detalle del producto",
    closable: true,
    children: "Podés cerrar este modal con el botón o con Escape.",
    footer: <Button>Entendido</Button>,
  },
  play: playHoverShowsNameTooltip(
    () => within(document.body).getByRole("button", { name: "Cerrar" }),
    "Cerrar",
  ),
};

export const ScrollingBody: Story = {
  args: {
    tone: "info",
    icon: <Info />,
    title: "Cambios de la compra",
    children: (
      <ul className="flex flex-col gap-2">
        {Array.from(
          { length: 30 },
          (_, index) => `Cambio ${index + 1}: cantidad de Yerba mate 1 kg de 10 a 12`,
        ).map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    ),
    footer: <Button>Entendido</Button>,
  },
  play: async () => {
    const body = within(document.body).getByRole("region", { name: "Cambios de la compra" });
    await userEvent.tab();
    await expect(body).toHaveFocus();
  },
};

export const ClosableWithEscapeKeycap: Story = {
  args: {
    tone: "info",
    icon: <Info />,
    title: "Reloj atrasado",
    context: "Caja 1",
    closable: true,
    escapeKeycap: true,
    children: "Podés cerrar este modal con Esc.",
    footer: <Button keycap="Enter">Confirmar hora</Button>,
  },
};
