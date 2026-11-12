import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShieldCheck, ShieldX } from "lucide-react";
import { ElevatedPanel } from "./elevated-panel";

const meta: Meta<typeof ElevatedPanel> = {
  title: "Components/ElevatedPanel",
  component: ElevatedPanel,
  decorators: [
    (Story) => (
      <div className="w-110 bg-surface-soft p-8">
        <Story />
      </div>
    ),
  ],
  args: {
    eyebrow: "Notebook nueva",
    title: "Dar de alta esta caja",
    icon: <ShieldCheck />,
    children: <p className="text-body text-text-subtle">Contenido del panel</p>,
  },
};

export default meta;

type Story = StoryObj<typeof ElevatedPanel>;

export const Info: Story = {};

export const ErrorTone: Story = {
  args: { tone: "error", icon: <ShieldX /> },
};

export const WithEscapeKey: Story = {
  args: {
    eyebrow: "Caja 1",
    title: "Dar de alta de nuevo",
    escapeKey: { name: "Volver con Esc", onPress: () => {} },
  },
};

export const WithoutEyebrow: Story = {
  render: ({ title, icon, children }) => (
    <ElevatedPanel title={title} icon={icon}>
      {children}
    </ElevatedPanel>
  ),
};
