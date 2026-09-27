import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlertTriangle, CheckCircle, Info, XCircle } from "lucide-react";
import { within } from "storybook/test";
import { playTabReachesFocusVisible } from "../test-support/story-interactions";
import { Button } from "./Button";
import { Modal } from "./Modal";

const meta: Meta<typeof Modal> = {
  title: "Components/Modal",
  component: Modal,
  args: {
    isOpen: true,
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
        <Button tone="destructive">Anular</Button>
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
    footer: <Button tone="destructive">Reintentar</Button>,
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
  play: playTabReachesFocusVisible(() =>
    within(document.body).getByRole("button", { name: "Cerrar" }),
  ),
};
