import type { Meta, StoryObj } from "@storybook/react-vite";
import { within } from "storybook/test";
import {
  playHoverSetsDataHovered,
  playTabReachesFocusVisible,
} from "../../test-support/story-interactions";
import { Pagination } from "./pagination";

const meta: Meta<typeof Pagination> = {
  title: "Components/Pagination",
  component: Pagination,
  args: {
    label: "Paginación",
    onPageChange: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof Pagination>;

function otherPageButton(canvasElement: HTMLElement): HTMLElement {
  return within(canvasElement).getByRole("button", { name: "Página 3" });
}

export const FewPages: Story = {
  args: { page: 3, pageCount: 5 },
};

export const FirstPage: Story = {
  args: { page: 1, pageCount: 24 },
};

export const MiddlePage: Story = {
  args: { page: 10, pageCount: 24 },
};

export const LastPage: Story = {
  args: { page: 24, pageCount: 24 },
};

export const HoveredPage: Story = {
  args: { page: 1, pageCount: 5 },
  play: playHoverSetsDataHovered(otherPageButton),
};

export const FocusVisible: Story = {
  args: { page: 1, pageCount: 5 },
  play: playTabReachesFocusVisible((canvasElement) =>
    within(canvasElement).getByRole("button", { name: "Anterior" }),
  ),
};
