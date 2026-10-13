import type { Meta, StoryObj } from "@storybook/react-vite";
import { Ban, CloudOff } from "lucide-react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { NotificationCard } from "./notification-card";
import { NotificationPanel } from "./notification-panel";
import { StatusIndicatorButton } from "./status-indicator-button";

const meta: Meta<typeof NotificationPanel> = {
  title: "Components/NotificationPanel",
  component: NotificationPanel,
  args: {
    title: "Avisos de esta caja",
    trigger: <StatusIndicatorButton tone="error">2 avisos</StatusIndicatorButton>,
    children: (
      <>
        <NotificationCard
          tone="error"
          icon={<Ban />}
          title="La caja no puede vender"
          description="La caja dejó de abrir ventas nuevas."
          whatToDo="Avisar al Administrador."
        />
        <NotificationCard
          tone="warning"
          icon={<CloudOff />}
          title="La caja no está sincronizando"
          description="Hace rato que no habla con la nube."
          whatToDo="Revisar la conexión."
        />
      </>
    ),
  },
};

export default meta;

type Story = StoryObj<typeof NotificationPanel>;

export const Closed: Story = {};

export const Open: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "2 avisos" }));
    await waitFor(() => {
      expect(within(document.body).getByRole("dialog")).toBeInTheDocument();
    });
  },
};
