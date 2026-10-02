import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "./card";

const meta: Meta<typeof Card> = {
  title: "Components/Card",
  component: Card,
  decorators: [
    (Story) => (
      <div style={{ width: "360px" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof Card>;

const content = (
  <>
    <p className="text-body font-bold text-text">Contá el efectivo</p>
    <p className="text-body text-text-subtle">Escribí cuánto hay en el cajón.</p>
  </>
);

export const Outlined: Story = {
  args: { children: content },
};

export const Subtle: Story = {
  args: { variant: "subtle", children: content },
};
