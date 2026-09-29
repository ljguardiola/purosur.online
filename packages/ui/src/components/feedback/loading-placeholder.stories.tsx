import type { Meta, StoryObj } from "@storybook/react-vite";
import { LoadingPlaceholder } from "./loading-placeholder";

const meta: Meta<typeof LoadingPlaceholder> = {
  title: "Components/LoadingPlaceholder",
  component: LoadingPlaceholder,
};

export default meta;

type Story = StoryObj<typeof LoadingPlaceholder>;

export const Form: Story = {
  args: { variant: "form", fields: 3 },
};

export const Card: Story = {
  args: { variant: "card", lines: 4 },
};

export const List: Story = {
  args: { variant: "list", items: 4 },
};
