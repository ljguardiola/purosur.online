import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { FilePicker } from "./file-picker";

const pdf = new File([new Uint8Array(2_516_582)], "lista-septiembre-2026.pdf", {
  type: "application/pdf",
});

const longNamePdf = new File(
  [new Uint8Array(1_200_000)],
  "lista-de-precios-mayoristas-herboristeria-del-norte-septiembre-2026-version-final.pdf",
  { type: "application/pdf" },
);

const meta: Meta<typeof FilePicker> = {
  title: "Components/FilePicker",
  component: FilePicker,
  args: {
    label: "Archivo",
    accept: "application/pdf,.pdf",
    chooseText: "Elegir un archivo",
    chooseAnotherText: "Elegir otro archivo",
    file: null,
    onChange: () => {},
    required: true,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "560px" }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof FilePicker>;

export const Empty: Story = {};

export const Chosen: Story = {
  args: { file: pdf },
};

export const LongName: Story = {
  args: { file: longNamePdf },
};

export const FocusVisible: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(within(canvasElement).getByLabelText("Archivo", { exact: true })).toHaveFocus();
  },
};

export const Described: Story = {
  args: { description: "Solo se aceptan archivos PDF." },
};

export const Invalid: Story = {
  args: { errorMessage: "Elegí un archivo." },
};

export const InvalidChosen: Story = {
  args: { file: pdf, errorMessage: "El archivo no es un PDF válido." },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const DisabledChosen: Story = {
  args: { file: pdf, disabled: true },
};
