import type { Meta, StoryObj } from "@storybook/react-vite";
import { Wallet } from "lucide-react";
import { SidePanel } from "./side-panel";
import { SidePanelTitle } from "./side-panel-title";

const meta: Meta<typeof SidePanelTitle> = {
  title: "Components/SidePanelTitle",
  component: SidePanelTitle,
  decorators: [
    (Story) => (
      <div style={{ display: "flex", justifyContent: "flex-end", height: "480px" }}>
        <SidePanel label="Abrir caja" header={<Story />}>
          <p className="text-body text-text-subtle">Contenido del panel</p>
        </SidePanel>
      </div>
    ),
  ],
  args: { icon: <Wallet />, title: "Abrir caja" },
};

export default meta;

type Story = StoryObj<typeof SidePanelTitle>;

export const Default: Story = {};
