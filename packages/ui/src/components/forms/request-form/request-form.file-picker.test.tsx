import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { z } from "zod";
import { useRequestForm } from "./request-form";

const FILE_MESSAGE = "Elegí el archivo.";

const pdf = new File([new Uint8Array(1_024)], "lista.pdf", { type: "application/pdf" });

function FileProbe({ onSubmit }: { onSubmit: (fileName: string) => Promise<void> }) {
  const { form, submit } = useRequestForm({
    defaultValues: { file: null as File | null },
    request: {
      schema: z.object({ fileName: z.string().min(1) }),
      from: ({ file }) => ({ fileName: file?.name ?? "" }),
    },
    fields: { fileName: "file" },
    messages: { file: FILE_MESSAGE },
    onSubmit: (request) => onSubmit(request.fileName),
  });
  return (
    <>
      <form.AppField name="file">
        {(field) => (
          <field.FilePicker
            label="Archivo"
            accept="application/pdf"
            chooseText="Elegir un archivo"
            chooseAnotherText="Elegir otro archivo"
          />
        )}
      </form.AppField>
      <button type="button" onClick={() => void submit()}>
        Enviar
      </button>
    </>
  );
}

test("a file picker describes its input with its field's message after a failed submit and clears it once a file is chosen", async () => {
  const screen = await render(<FileProbe onSubmit={() => Promise.resolve()} />);
  const input = screen.getByLabelText("Archivo", { exact: true });

  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.element(input).toHaveAccessibleDescription(FILE_MESSAGE);
  await expect.element(input).toHaveAttribute("aria-invalid", "true");

  await userEvent.upload(input, pdf);

  await expect.element(screen.getByText(FILE_MESSAGE)).not.toBeInTheDocument();
});

test("a file picker submits the request built from the file that was chosen", async () => {
  const onSubmit = vi.fn<(fileName: string) => Promise<void>>(() => Promise.resolve());
  const screen = await render(<FileProbe onSubmit={onSubmit} />);

  await userEvent.upload(screen.getByLabelText("Archivo", { exact: true }), pdf);
  await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

  await expect.poll(() => onSubmit.mock.calls.length).toBe(1);
  expect(onSubmit).toHaveBeenCalledWith("lista.pdf");
  await expect.element(screen.getByText("lista.pdf")).toBeVisible();
});
