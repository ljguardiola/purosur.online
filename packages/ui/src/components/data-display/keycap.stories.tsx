import type { Meta, StoryObj } from "@storybook/react-vite";
import { Keycap } from "./keycap";

const meta: Meta<typeof Keycap> = {
  title: "Components/Keycap",
  component: Keycap,
  args: { keyName: "F2" },
};

export default meta;

type Story = StoryObj<typeof Keycap>;

export const FunctionKey: Story = {};

export const FirstFunctionKey: Story = {
  args: { keyName: "F1" },
};

export const Escape: Story = {
  args: { keyName: "Escape" },
};

export const Delete: Story = {
  args: { keyName: "Delete" },
};

export const Arrows: Story = {
  args: { keyName: "ArrowUpDown" },
};

export const ArrowUp: Story = {
  args: { keyName: "ArrowUp" },
};

export const ArrowDown: Story = {
  args: { keyName: "ArrowDown" },
};

export const Digits: Story = {
  args: { keyName: "Digits" },
};

export const Tab: Story = {
  args: { keyName: "Tab" },
};

export const KeypadPlus: Story = {
  args: { keyName: "NumpadAdd" },
};

export const KeypadMinus: Story = {
  args: { keyName: "NumpadSubtract" },
};

export const KeypadPlusMinus: Story = {
  args: { keyName: "NumpadAddSubtract" },
};

export const Letter: Story = {
  args: { keyName: "K" },
};

export const OnPrimary: Story = {
  args: { keyName: "Enter", variant: "onPrimary" },
  decorators: [
    (Story) => (
      <div className="inline-flex rounded-lg bg-action p-4">
        <Story />
      </div>
    ),
  ],
};
