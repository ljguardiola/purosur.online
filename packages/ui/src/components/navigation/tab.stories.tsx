import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tab, Tabs } from "./tabs";

const meta: Meta<typeof Tab> = {
  title: "Components/Tab",
  component: Tab,
  decorators: [
    (Story) => (
      <div className="bg-surface-soft" style={{ width: "320px" }}>
        <Tabs label="Secciones de Personas" selectedTab="users" tabs={<Story />}>
          <p className="p-4 text-body text-text">Usuarios</p>
        </Tabs>
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof Tab>;

export const Selected: Story = {
  args: { value: "users", label: "Usuarios", href: "#users" },
};
