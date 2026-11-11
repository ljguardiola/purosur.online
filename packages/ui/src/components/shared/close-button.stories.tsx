import type { Meta, StoryObj } from "@storybook/react-vite";
import { CloseButton } from "./close-button";

const meta: Meta<typeof CloseButton> = {
  title: "Components/CloseButton",
  component: CloseButton,
  args: { onPress: () => {} },
};

export default meta;

type Story = StoryObj<typeof CloseButton>;

export const Default: Story = {};

export const WithEscapeKeycap: Story = { args: { escapeKeycap: true } };
