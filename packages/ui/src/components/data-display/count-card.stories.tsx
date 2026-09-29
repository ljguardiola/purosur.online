import type { Meta, StoryObj } from "@storybook/react-vite";
import { within } from "storybook/test";
import {
  playPseudoHoverPaintsBoneFill,
  playTabMatchesCssFocusVisible,
} from "../../test-support/story-interactions";
import { CountCard } from "./count-card";

function link(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("link");
}

const meta: Meta<typeof CountCard> = {
  title: "Components/CountCard",
  component: CountCard,
  args: {
    label: "Alertas críticas",
    count: 4,
    tone: "error",
    href: "#",
  },
};

export default meta;

type Story = StoryObj<typeof CountCard>;

const criticalDetail = "Acceso ampliado · Passkey";

export const ErrorTone: Story = {
  args: { detail: criticalDetail },
};

export const WarningTone: Story = {
  args: {
    label: "Advertencias",
    count: 2,
    tone: "warning",
    detail: "Correo · Recuperación de acceso",
  },
};

export const InfoTone: Story = {
  args: {
    label: "Informativas",
    count: 2,
    tone: "info",
    detail: "Bloqueo de ingreso",
  },
};

export const WithoutDetail: Story = {
  args: { label: "Informativas", count: 0, tone: "info" },
};

export const Hovered: Story = {
  args: { detail: criticalDetail },
  parameters: { pseudo: { hover: true } },
  play: playPseudoHoverPaintsBoneFill(link),
};

export const FocusVisible: Story = {
  args: { detail: criticalDetail },
  play: playTabMatchesCssFocusVisible(link),
};
