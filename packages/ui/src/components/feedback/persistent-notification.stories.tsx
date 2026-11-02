import type { Meta, StoryObj } from "@storybook/react-vite";
import { Info as InfoIcon } from "lucide-react";
import { PersistentNotification } from "./persistent-notification";

const meta: Meta<typeof PersistentNotification> = {
  title: "Components/PersistentNotification",
  component: PersistentNotification,
  decorators: [
    (Story) => (
      // The notification is fixed to the viewport and takes no room of its own; without a page as
      // tall as the viewport, the catalog's screenshot of the body would crop it away.
      <div style={{ minHeight: "calc(100vh - 2rem)" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof PersistentNotification>;

export const Info: Story = {
  args: {
    tone: "info",
    icon: <InfoIcon />,
    title: "Hay una versión nueva",
    description: "Recargá la página para usarla.",
    action: { label: "Recargar", onPress: () => {} },
  },
};

export const WithoutDescription: Story = {
  args: {
    tone: "info",
    icon: <InfoIcon />,
    title: "Hay una versión nueva",
    action: { label: "Recargar", onPress: () => {} },
  },
};
