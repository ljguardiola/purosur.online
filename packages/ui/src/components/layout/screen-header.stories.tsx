import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ScreenHeader } from "./screen-header";

const meta: Meta<typeof ScreenHeader> = {
  title: "Components/ScreenHeader",
  component: ScreenHeader,
};

export default meta;

type Story = StoryObj<typeof ScreenHeader>;

export const WithEyebrow: Story = {
  args: { eyebrow: "Caja 1 · Sesión abierta 09:02", title: "Venta en curso" },
};

export const WithEyebrowAndDescription: Story = {
  args: {
    eyebrow: "Notebook nueva",
    title: "Dar de alta esta caja",
    description:
      "Escribí el código de alta que se genera en el backoffice, en Cajas registradoras.",
  },
};

export const TitleAndDescription: Story = {
  args: {
    title: "Cambiar el PIN",
    description: "Escribí el código que te dieron desde el backoffice. Hace falta internet.",
  },
};

export const TitleOnly: Story = {
  args: { title: "Cambiar el PIN" },
};

export const FocusableTitle: Story = {
  args: {
    eyebrow: "Puro Sur",
    title: "Ingresar",
    description: "Usá la passkey de este dispositivo.",
    focusableTitle: true,
  },
  play: async ({ canvasElement }) => {
    const title = within(canvasElement).getByRole("heading", { name: "Ingresar" });
    await userEvent.tab();
    title.focus();
    await expect(title).toHaveFocus();
  },
};

export const LongText: Story = {
  args: {
    eyebrow: "Caja 1 · Sesión abierta 09:02",
    title: "Un título largo que no entra en una sola línea",
    description:
      "Una descripción larga que no entra en una sola línea dentro de este espacio angosto",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "240px" }}>
        <Story />
      </div>
    ),
  ],
};
