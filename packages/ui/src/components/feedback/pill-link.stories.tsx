import type { Meta, StoryObj } from "@storybook/react-vite";
import { Bell, TriangleAlert } from "lucide-react";
import { expect, waitFor, within } from "storybook/test";
import { tokenRgb } from "../../test/token-colors";
import { playTabMatchesCssFocusVisible } from "../../test-support/story-interactions";
import { PillLink } from "./pill-link";

function link(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("link");
}

const meta: Meta<typeof PillLink> = {
  title: "Components/PillLink",
  component: PillLink,
  args: {
    tone: "warning",
    icon: <Bell />,
    href: "/alerts",
    children: "3 alertas abiertas",
  },
};

export default meta;

type Story = StoryObj<typeof PillLink>;

export const Warning: Story = {};

export const ErrorTone: Story = {
  args: { tone: "error", icon: <TriangleAlert />, children: "2 cajas sin sincronizar" },
};

export const Hovered: Story = {
  parameters: { pseudo: { hover: true } },
  play: async ({ canvasElement }) => {
    const target = link(canvasElement);
    await waitFor(() => {
      expect(getComputedStyle(target).boxShadow).toContain(
        `${tokenRgb("warning-soft")} 0px 0px 0px 1px`,
      );
    });
  },
};

export const FocusVisible: Story = {
  play: playTabMatchesCssFocusVisible(link),
};
