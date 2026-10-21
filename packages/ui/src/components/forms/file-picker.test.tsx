import { useId, useState } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { FilePicker, type FilePickerProps } from "./file-picker";

const pdf = new File([new Uint8Array(2_516_582)], "lista-septiembre-2026.pdf", {
  type: "application/pdf",
});

const texts = {
  label: "Archivo",
  chooseText: "Elegir un archivo",
  chooseAnotherText: "Elegir otro archivo",
  accept: "application/pdf,.pdf",
} as const;

function WithSharedError() {
  const errorId = useId();
  return (
    <>
      <FilePicker {...texts} file={null} onChange={() => {}} errorMessageId={errorId} />
      <p id={errorId}>Elegí un archivo</p>
    </>
  );
}

function Harness({ initial = null }: { initial?: File | null }) {
  const [file, setFile] = useState<File | null>(initial);
  return <FilePicker {...texts} file={file} onChange={setFile} />;
}

test("offers the choose text while no file is chosen", async () => {
  const screen = await render(<FilePicker {...texts} file={null} onChange={() => {}} />);

  await expect.element(screen.getByText("Elegir un archivo")).toBeVisible();
  expect(screen.getByText("Elegir otro archivo").query()).toBeNull();
});

test("names its native input by its label and the action it offers", async () => {
  const empty = await render(<FilePicker {...texts} file={null} onChange={() => {}} />);
  const emptyInput = empty.getByLabelText("Archivo", { exact: true });
  await expect.element(emptyInput).toHaveAttribute("type", "file");
  await expect.element(emptyInput).toHaveAccessibleName("Archivo Elegir un archivo");
  await empty.unmount();

  const chosen = await render(<FilePicker {...texts} file={pdf} onChange={() => {}} />);
  await expect
    .element(chosen.getByLabelText("Archivo", { exact: true }))
    .toHaveAccessibleName("Archivo Elegir otro archivo");
});

test("shows the chosen file's name and size, and offers to choose another", async () => {
  const screen = await render(<FilePicker {...texts} file={pdf} onChange={() => {}} />);

  await expect.element(screen.getByText("lista-septiembre-2026.pdf")).toBeVisible();
  await expect.element(screen.getByText("3 MB")).toBeVisible();
  await expect.element(screen.getByText("Elegir otro archivo")).toBeVisible();
  expect(screen.getByText("Elegir un archivo").query()).toBeNull();
});

test("announces the chosen file as the description of its input", async () => {
  const screen = await render(<FilePicker {...texts} file={pdf} onChange={() => {}} />);

  await expect
    .element(screen.getByLabelText("Archivo", { exact: true }))
    .toHaveAccessibleDescription("lista-septiembre-2026.pdf 3 MB");
});

test("only accepts the types it is given", async () => {
  const screen = await render(<FilePicker {...texts} file={null} onChange={() => {}} />);

  await expect
    .element(screen.getByLabelText("Archivo", { exact: true }))
    .toHaveAttribute("accept", "application/pdf,.pdf");
});

test("reports the file the person picks", async () => {
  const onChange = vi.fn();
  const screen = await render(<FilePicker {...texts} file={null} onChange={onChange} />);

  await userEvent.upload(screen.getByLabelText("Archivo", { exact: true }), pdf);

  expect(onChange).toHaveBeenCalledWith(pdf);
});

test("reports the same file again when the person picks it a second time", async () => {
  const onChange = vi.fn();
  const screen = await render(<FilePicker {...texts} file={pdf} onChange={onChange} />);
  const input = screen.getByLabelText("Archivo", { exact: true });

  await userEvent.upload(input, pdf);
  await userEvent.upload(input, pdf);

  expect(onChange).toHaveBeenCalledTimes(2);
});

test("switches from the empty to the chosen state once a file is picked", async () => {
  const screen = await render(<Harness />);

  await userEvent.upload(screen.getByLabelText("Archivo", { exact: true }), pdf);

  await expect.element(screen.getByText("lista-septiembre-2026.pdf")).toBeVisible();
  await expect.element(screen.getByText("Elegir otro archivo")).toBeVisible();
});

test("takes keyboard focus on its native input, which opens the chooser", async () => {
  const screen = await render(<FilePicker {...texts} file={null} onChange={() => {}} />);
  const input = screen.getByLabelText("Archivo", { exact: true }).element() as HTMLInputElement;

  await userEvent.tab();

  expect(document.activeElement).toBe(input);
  expect(input.tabIndex).toBe(0);
});

test("opens the native chooser when its visible area is clicked", async () => {
  const screen = await render(<FilePicker {...texts} file={null} onChange={() => {}} />);
  const input = screen.getByLabelText("Archivo", { exact: true }).element() as HTMLInputElement;
  const opened = new Promise<void>((resolve) => {
    input.addEventListener("click", (event) => {
      event.preventDefault();
      resolve();
    });
  });

  await userEvent.click(screen.getByText("Elegir un archivo"));

  await opened;
});

test("shows the package's focus ring around its area when its input is focused", async () => {
  const screen = await render(<FilePicker {...texts} file={null} onChange={() => {}} />);
  const area = screen.getByText("Elegir un archivo").element().closest("label") as HTMLElement;

  await userEvent.tab();

  await expect.poll(() => getComputedStyle(area).outlineWidth).toBe("3px");
  await expect.poll(() => getComputedStyle(area).outlineColor).toBe(tokenRgb("focus"));
});

test("draws its area dashed on the subtle surface", async () => {
  const screen = await render(<FilePicker {...texts} file={null} onChange={() => {}} />);
  const area = screen.getByText("Elegir un archivo").element().closest("label") as HTMLElement;
  const style = getComputedStyle(area);

  expect(style.borderTopStyle).toBe("dashed");
  expect(style.borderTopWidth).toBe("2px");
  expect(style.borderTopColor).toBe(tokenRgb("action"));
  expect(style.backgroundColor).toBe(tokenRgb("surface-subtle"));
  expect(style.borderRadius).toBe("8px");
});

test("draws the chosen file on a white card with a line border", async () => {
  const screen = await render(<FilePicker {...texts} file={pdf} onChange={() => {}} />);
  const card = screen.getByText("lista-septiembre-2026.pdf").element().parentElement
    ?.parentElement as HTMLElement;
  const style = getComputedStyle(card);

  expect(style.backgroundColor).toBe(tokenRgb("surface"));
  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderTopColor).toBe(tokenRgb("border"));
  expect(getComputedStyle(screen.getByText("lista-septiembre-2026.pdf").element()).fontWeight).toBe(
    "700",
  );
});

test("truncates a name too long for its container", async () => {
  const longName = new File([new Uint8Array(10)], `${"lista-".repeat(30)}.pdf`);
  const screen = await render(
    <div style={{ width: "320px" }}>
      <FilePicker {...texts} file={longName} onChange={() => {}} />
    </div>,
  );
  const area = screen.getByText("Elegir otro archivo").element().closest("label") as HTMLElement;

  expect(area.scrollWidth).toBeLessThanOrEqual(area.clientWidth);
});

test("appends the required asterisk to its label only when required", async () => {
  const required = await render(<FilePicker {...texts} file={null} onChange={() => {}} required />);
  expect(getComputedStyle(required.getByText("Archivo").element(), "::after").content).toContain(
    "*",
  );
  await required.unmount();

  const optional = await render(<FilePicker {...texts} file={null} onChange={() => {}} />);
  expect(
    getComputedStyle(optional.getByText("Archivo").element(), "::after").content,
  ).not.toContain("*");
});

test("shows its description below the area and describes the input with it", async () => {
  const screen = await render(
    <FilePicker {...texts} file={null} onChange={() => {}} description="Solo PDF" />,
  );

  await expect.element(screen.getByText("Solo PDF")).toBeVisible();
  await expect
    .element(screen.getByLabelText("Archivo", { exact: true }))
    .toHaveAccessibleDescription("Solo PDF");
  expect(getComputedStyle(screen.getByText("Solo PDF").element()).color).toBe(
    tokenRgb("text-subtle"),
  );
});

test("shows its error in place of the description, in the error color, and marks the input invalid", async () => {
  const screen = await render(
    <FilePicker
      {...texts}
      file={null}
      onChange={() => {}}
      description="Solo PDF"
      errorMessage="Elegí un archivo"
    />,
  );
  const area = screen.getByText("Elegir un archivo").element().closest("label") as HTMLElement;
  const input = screen.getByLabelText("Archivo", { exact: true });

  expect(screen.getByText("Solo PDF").query()).toBeNull();
  expect(getComputedStyle(screen.getByText("Elegí un archivo").element()).color).toBe(
    tokenRgb("error"),
  );
  expect(getComputedStyle(area).borderTopColor).toBe(tokenRgb("error"));
  await expect.element(input).toBeInvalid();
  await expect.element(input).toHaveAccessibleDescription("Elegí un archivo");
});

test("is described by an error rendered elsewhere and marked invalid", async () => {
  const screen = await render(<WithSharedError />);
  const input = screen.getByLabelText("Archivo", { exact: true });

  await expect.element(input).toBeInvalid();
  await expect.element(input).toHaveAccessibleDescription("Elegí un archivo");
});

test("dims its area to 45% and neither takes focus nor opens when disabled", async () => {
  const onChange = vi.fn();
  const screen = await render(
    <>
      <FilePicker {...texts} file={null} onChange={onChange} disabled />
      <button type="button">Next control</button>
    </>,
  );
  const input = screen.getByLabelText("Archivo", { exact: true }).element() as HTMLInputElement;
  const area = screen.getByText("Elegir un archivo").element().closest("label") as HTMLElement;

  await userEvent.tab();

  expect(input.disabled).toBe(true);
  expect(getComputedStyle(area).opacity).toBe("0.45");
  expect(getComputedStyle(area).cursor).toBe("default");
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Next control" }).element(),
  );
  expect(onChange).not.toHaveBeenCalled();
});

test("has no accessibility violations empty, chosen, invalid or disabled", async () => {
  const states = [
    <FilePicker key="empty" {...texts} file={null} onChange={() => {}} required />,
    <FilePicker key="chosen" {...texts} file={pdf} onChange={() => {}} />,
    <FilePicker key="invalid" {...texts} file={null} onChange={() => {}} errorMessage="Falta" />,
    <FilePicker key="disabled" {...texts} file={pdf} onChange={() => {}} disabled />,
  ];
  for (const state of states) {
    const screen = await render(state);
    await expectNoAccessibilityViolations(screen.container);
    await screen.unmount();
  }
});

test("requires its label, accept and both action texts, with no default", () => {
  expectTypeOf<Omit<FilePickerProps, "label">>().not.toExtend<FilePickerProps>();
  expectTypeOf<Omit<FilePickerProps, "accept">>().not.toExtend<FilePickerProps>();
  expectTypeOf<Omit<FilePickerProps, "chooseText">>().not.toExtend<FilePickerProps>();
  expectTypeOf<Omit<FilePickerProps, "chooseAnotherText">>().not.toExtend<FilePickerProps>();
});

test("reports a file or null", () => {
  expectTypeOf<FilePickerProps["onChange"]>().toEqualTypeOf<(file: File | null) => void>();
});
