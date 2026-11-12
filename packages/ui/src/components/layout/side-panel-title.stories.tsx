import type { Meta, StoryObj } from "@storybook/react-vite";
import { Undo2, Wallet } from "lucide-react";
import { CloseButton } from "../shared/close-button";
import { SidePanel } from "./side-panel";
import { SidePanelTitle } from "./side-panel-title";

const meta: Meta<typeof SidePanelTitle> = {
  title: "Components/SidePanelTitle",
  component: SidePanelTitle,
  decorators: [
    (Story) => (
      <div style={{ display: "flex", justifyContent: "flex-end", height: "480px" }}>
        <SidePanel label="Abrir caja" width="wide" header={<Story />}>
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

export const WithEscapeKeycap: Story = {
  args: { close: { onPress: () => {} } },
};

export const WithLabelledEscapeKeycap: Story = {
  args: { close: { onPress: () => {}, label: "Cancelar" } },
};

export const WithDisabledLabelledEscapeKeycap: Story = {
  args: { close: { onPress: () => {}, label: "Cancelar", disabled: true } },
};

export const Warning: Story = {
  args: {
    icon: <Undo2 />,
    title: "¿Pasar el cobro a reembolso?",
    tone: "warning",
    children: <CloseButton onPress={() => undefined} />,
  },
};
