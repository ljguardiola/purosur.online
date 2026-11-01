import type { Meta, StoryObj } from "@storybook/react-vite";
import { SpreadsheetDownloadButton } from "./spreadsheet-download-button";

const meta: Meta<typeof SpreadsheetDownloadButton> = {
  title: "Components/SpreadsheetDownloadButton",
  component: SpreadsheetDownloadButton,
  args: { onPress: () => {} },
};

export default meta;

type Story = StoryObj<typeof SpreadsheetDownloadButton>;

export const Ready: Story = {};

export const WaitingForData: Story = {
  args: { dataStatus: "loading" },
};

export const Preparing: Story = {
  args: { preparing: true },
};

export const DisabledWithReason: Story = {
  args: { disabledReason: "No hay filas para descargar." },
};
