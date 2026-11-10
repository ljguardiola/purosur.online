import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { KeyBinding, KeyOptions } from "./key-layer";
import { KeyLayerProvider, useKeys } from "./key-layer";

function Keys({
  bindings,
  options,
  field,
}: {
  bindings: readonly KeyBinding[];
  options?: KeyOptions;
  field?: boolean;
}) {
  const legend = useKeys(bindings, options);
  return (
    <div>
      {field === true ? <input aria-label="Producto" /> : null}
      <ul aria-label="Legend">
        {legend.map((item) => (
          <li key={item.keyName}>{`${item.keyName} ${item.label}`}</li>
        ))}
      </ul>
    </div>
  );
}

function renderLayer(ui: React.ReactNode) {
  return render(ui, { wrapper: KeyLayerProvider });
}

function ScreenWithModal({
  modalOpen,
  screenRun,
  modalRun,
}: {
  modalOpen: boolean;
  screenRun: () => void;
  modalRun: () => void;
}) {
  return (
    <>
      <Keys
        bindings={[
          { key: "F2", run: screenRun },
          { key: "Enter", run: screenRun },
          { key: "Escape", run: screenRun },
        ]}
      />
      {modalOpen ? (
        <Keys
          bindings={[
            { key: "Enter", run: modalRun },
            { key: "Escape", run: modalRun },
          ]}
          options={{ modal: true }}
        />
      ) : null}
    </>
  );
}

function Stack({
  innerOpen,
  outer,
  inner,
}: {
  innerOpen: boolean;
  outer: () => void;
  inner: () => void;
}) {
  return (
    <>
      <Keys bindings={[{ key: "Enter", run: outer }]} options={{ modal: true }} />
      {innerOpen ? (
        <Keys bindings={[{ key: "Enter", run: inner }]} options={{ modal: true }} />
      ) : null}
    </>
  );
}

describe("useKeys", () => {
  it("runs the handler of a registered key", async () => {
    const run = vi.fn();
    await renderLayer(<Keys bindings={[{ key: "F2", run }]} />);

    await userEvent.keyboard("{F2}");

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs the latest handler it was given, not the one of the first render", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const screen = await renderLayer(<Keys bindings={[{ key: "F2", run: first }]} />);
    await screen.rerender(<Keys bindings={[{ key: "F2", run: second }]} />);

    await userEvent.keyboard("{F2}");

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("runs nothing for a binding that is not enabled", async () => {
    const run = vi.fn();
    await renderLayer(<Keys bindings={[{ key: "F2", run, enabled: false }]} />);

    await userEvent.keyboard("{F2}");

    expect(run).not.toHaveBeenCalled();
  });

  it("runs nothing while it is not active", async () => {
    const run = vi.fn();
    await renderLayer(<Keys bindings={[{ key: "Escape", run }]} options={{ active: false }} />);

    await userEvent.keyboard("{Escape}");

    expect(run).not.toHaveBeenCalled();
  });

  it("matches Escape, Enter, Delete and Space by name", async () => {
    const run = vi.fn();
    await renderLayer(
      <Keys
        bindings={[
          { key: "Escape", run },
          { key: "Enter", run },
          { key: "Delete", run },
          { key: "Space", run },
        ]}
      />,
    );

    await userEvent.keyboard("{Escape}{Enter}{Delete} ");

    expect(run.mock.calls.map(([pressed]) => pressed)).toEqual(["Escape", "Enter", "Delete", " "]);
  });

  it("hands the pressed arrow to an ArrowUpDown binding and ignores the horizontal ones", async () => {
    const run = vi.fn();
    await renderLayer(<Keys bindings={[{ key: "ArrowUpDown", run }]} />);

    await userEvent.keyboard("{ArrowDown}{ArrowLeft}{ArrowUp}");

    expect(run.mock.calls.map(([pressed]) => pressed)).toEqual(["ArrowDown", "ArrowUp"]);
  });

  it("hands the pressed arrow to an ArrowLeftRight binding", async () => {
    const run = vi.fn();
    await renderLayer(<Keys bindings={[{ key: "ArrowLeftRight", run }]} />);

    await userEvent.keyboard("{ArrowLeft}{ArrowRight}{ArrowUp}");

    expect(run.mock.calls.map(([pressed]) => pressed)).toEqual(["ArrowLeft", "ArrowRight"]);
  });

  it("hands the pressed digit to a Digits binding", async () => {
    const run = vi.fn();
    await renderLayer(<Keys bindings={[{ key: "Digits", run }]} />);

    await userEvent.keyboard("7a2");

    expect(run.mock.calls.map(([pressed]) => pressed)).toEqual(["7", "2"]);
  });

  it("matches a letter whatever its case", async () => {
    const run = vi.fn();
    await renderLayer(<Keys bindings={[{ key: "N", run }]} />);

    await userEvent.keyboard("nN");

    expect(run).toHaveBeenCalledTimes(2);
  });

  it("ignores a key pressed with Control", async () => {
    const run = vi.fn();
    await renderLayer(<Keys bindings={[{ key: "N", run }]} />);

    await userEvent.keyboard("{Control>}n{/Control}");

    expect(run).not.toHaveBeenCalled();
  });

  it("stops a handled key from reaching anything else", async () => {
    const run = vi.fn();
    const reached = vi.fn();
    document.body.addEventListener("keydown", reached);
    await renderLayer(<Keys bindings={[{ key: "F2", run }]} />);

    await userEvent.keyboard("{F2}");
    await userEvent.keyboard("{F3}");

    document.body.removeEventListener("keydown", reached);
    expect(reached.mock.calls.map(([event]) => event.key)).toEqual(["F3"]);
  });

  it("returns the legend of the enabled bindings that have a label", async () => {
    const screen = await renderLayer(
      <Keys
        bindings={[
          { key: "F2", label: "Buscar", run: vi.fn() },
          { key: "F3", label: "Oculta", run: vi.fn(), enabled: false },
          { key: "Escape", run: vi.fn() },
        ]}
      />,
    );

    await expect.element(screen.getByRole("listitem")).toHaveTextContent("F2 Buscar");
    expect(screen.getByRole("listitem").elements()).toHaveLength(1);
  });

  describe("with a modal open", () => {
    it("runs the screen's F2 when no modal is open", async () => {
      const screenRun = vi.fn();
      await renderLayer(
        <ScreenWithModal modalOpen={false} screenRun={screenRun} modalRun={vi.fn()} />,
      );

      await userEvent.keyboard("{F2}");

      expect(screenRun).toHaveBeenCalledTimes(1);
    });

    it("does not run the screen's F2 while a modal is open", async () => {
      const screenRun = vi.fn();
      await renderLayer(
        <ScreenWithModal modalOpen={true} screenRun={screenRun} modalRun={vi.fn()} />,
      );

      await userEvent.keyboard("{F2}");

      expect(screenRun).not.toHaveBeenCalled();
    });

    it("runs only the modal's Enter and Escape", async () => {
      const screenRun = vi.fn();
      const modalRun = vi.fn();
      await renderLayer(
        <ScreenWithModal modalOpen={true} screenRun={screenRun} modalRun={modalRun} />,
      );

      await userEvent.keyboard("{Enter}{Escape}");

      expect(modalRun).toHaveBeenCalledTimes(2);
      expect(screenRun).not.toHaveBeenCalled();
    });

    it("gives the screen its keys back when the modal closes", async () => {
      const screenRun = vi.fn();
      const screen = await renderLayer(
        <ScreenWithModal modalOpen={true} screenRun={screenRun} modalRun={vi.fn()} />,
      );
      await screen.rerender(
        <ScreenWithModal modalOpen={false} screenRun={screenRun} modalRun={vi.fn()} />,
      );

      await userEvent.keyboard("{F2}");

      expect(screenRun).toHaveBeenCalledTimes(1);
    });

    it("lets only the most recently opened of two modals run", async () => {
      const outer = vi.fn();
      const inner = vi.fn();
      const screen = await renderLayer(<Stack innerOpen={false} outer={outer} inner={inner} />);
      await screen.rerender(<Stack innerOpen={true} outer={outer} inner={inner} />);

      await userEvent.keyboard("{Enter}");

      expect(inner).toHaveBeenCalledTimes(1);
      expect(outer).not.toHaveBeenCalled();
    });

    it("keeps the screen's keys from an open dialog that registers none", async () => {
      const screenRun = vi.fn();
      await renderLayer(
        <>
          <Keys bindings={[{ key: "Enter", run: screenRun }]} />
          <div role="dialog" aria-label="Aviso">
            <button type="button">Entendido</button>
          </div>
        </>,
      );

      await userEvent.click(document.querySelector("button") as HTMLElement);
      await userEvent.keyboard("{Enter}");

      expect(screenRun).not.toHaveBeenCalled();
    });
  });

  describe("with a text field", () => {
    it("leaves a letter to the focused field and does not run the handler", async () => {
      const run = vi.fn();
      const screen = await renderLayer(<Keys bindings={[{ key: "N", run }]} field />);
      const field = screen.getByLabelText("Producto");

      await userEvent.click(field);
      await userEvent.keyboard("n");

      expect(run).not.toHaveBeenCalled();
      await expect.element(field).toHaveValue("n");
    });

    it("leaves a digit and a space to the focused field", async () => {
      const run = vi.fn();
      const screen = await renderLayer(
        <Keys
          bindings={[
            { key: "Digits", run },
            { key: "Space", run },
          ]}
          field
        />,
      );
      const field = screen.getByLabelText("Producto");

      await userEvent.click(field);
      await userEvent.keyboard("4 5");

      expect(run).not.toHaveBeenCalled();
      await expect.element(field).toHaveValue("4 5");
    });

    it("runs the handler of a letter when no field is focused", async () => {
      const run = vi.fn();
      await renderLayer(<Keys bindings={[{ key: "N", run }]} field />);

      await userEvent.keyboard("n");

      expect(run).toHaveBeenCalledTimes(1);
    });

    it("still runs Enter, Escape, the arrows and the function keys from the field", async () => {
      const run = vi.fn();
      const screen = await renderLayer(
        <Keys
          bindings={[
            { key: "Enter", run },
            { key: "Escape", run },
            { key: "ArrowUpDown", run },
            { key: "F2", run },
          ]}
          field
        />,
      );

      await userEvent.click(screen.getByLabelText("Producto"));
      await userEvent.keyboard("{Enter}{Escape}{ArrowDown}{F2}");

      expect(run).toHaveBeenCalledTimes(4);
    });
  });

  it("leaves only the new screen's keys after one screen unmounts and another mounts", async () => {
    const oldRun = vi.fn();
    const newRun = vi.fn();
    const screen = await renderLayer(<Keys bindings={[{ key: "F2", run: oldRun }]} />);
    await screen.unmount();
    await renderLayer(<Keys bindings={[{ key: "F3", run: newRun }]} />);

    await userEvent.keyboard("{F2}{F3}");

    expect(oldRun).not.toHaveBeenCalled();
    expect(newRun).toHaveBeenCalledTimes(1);
  });
});
