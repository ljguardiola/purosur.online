import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRef } from "react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
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

function ScopedKeys({ run, clicked }: { run: () => void; clicked: () => void }) {
  const form = useRef<HTMLFormElement>(null);
  useKeys(
    [
      { key: "Enter", run },
      { key: "ArrowUpDown", run },
    ],
    { within: form },
  );
  return (
    <>
      <form ref={form}>
        <input aria-label="Producto" />
      </form>
      <button type="button" onClick={clicked}>
        Salir
      </button>
    </>
  );
}

function FrameAndScreen({
  frameRun,
  screenRun,
  screenEnabled,
}: {
  frameRun: () => void;
  screenRun: () => void;
  screenEnabled: boolean;
}) {
  return (
    <>
      <Keys bindings={[{ key: "Escape", run: screenRun, enabled: screenEnabled }]} />
      <Keys bindings={[{ key: "Escape", run: frameRun }]} options={{ fallback: true }} />
    </>
  );
}

function FieldThatHandlesEscape({ frameRun }: { frameRun: () => void }) {
  useKeys([{ key: "Escape", run: frameRun }], { fallback: true });
  return (
    <input
      aria-label="Producto"
      onKeyDown={(event: ReactKeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
        }
      }}
    />
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

  describe("with a focused button", () => {
    it("leaves Enter to the focused button instead of the screen's Enter", async () => {
      const run = vi.fn();
      const clicked = vi.fn();
      const screen = await renderLayer(
        <>
          <Keys bindings={[{ key: "Enter", run }]} />
          <button type="button" onClick={clicked}>
            Volver
          </button>
        </>,
      );

      screen.getByRole("button", { name: "Volver" }).element().focus();
      await userEvent.keyboard("{Enter}");

      expect(run).not.toHaveBeenCalled();
      expect(clicked).toHaveBeenCalledTimes(1);
    });

    it("still runs the screen's other keys from the focused button", async () => {
      const run = vi.fn();
      const screen = await renderLayer(
        <>
          <Keys bindings={[{ key: "Escape", run }]} />
          <button type="button">Volver</button>
        </>,
      );

      screen.getByRole("button", { name: "Volver" }).element().focus();
      await userEvent.keyboard("{Escape}");

      expect(run).toHaveBeenCalledTimes(1);
    });
  });

  describe("keys that act while typing", () => {
    function press(target: Element, key: string, code: string) {
      const event = new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event;
    }

    it("runs a letter flagged to act while typing from a focused field", async () => {
      const run = vi.fn();
      const screen = await renderLayer(
        <Keys bindings={[{ key: "R", run, whileTyping: true }]} field />,
      );
      const field = screen.getByLabelText("Producto");

      await userEvent.click(field);
      await userEvent.keyboard("r");

      expect(run).toHaveBeenCalledTimes(1);
      await expect.element(field).toHaveValue("");
    });

    it("runs the keypad's plus and minus from a focused field without typing them", async () => {
      const add = vi.fn();
      const subtract = vi.fn();
      const screen = await renderLayer(
        <Keys
          bindings={[
            { key: "NumpadAdd", run: add, whileTyping: true },
            { key: "NumpadSubtract", run: subtract, whileTyping: true },
          ]}
          field
        />,
      );
      const field = screen.getByLabelText("Producto");
      await userEvent.click(field);

      const plus = press(field.element(), "+", "NumpadAdd");
      const minus = press(field.element(), "-", "NumpadSubtract");

      expect(add).toHaveBeenCalledTimes(1);
      expect(subtract).toHaveBeenCalledTimes(1);
      expect(plus.defaultPrevented).toBe(true);
      expect(minus.defaultPrevented).toBe(true);
    });

    it("runs one binding for both keypad keys, telling which one was pressed", async () => {
      const run = vi.fn();
      const screen = await renderLayer(
        <Keys bindings={[{ key: "NumpadAddSubtract", run, whileTyping: true }]} field />,
      );
      const field = screen.getByLabelText("Producto");
      await userEvent.click(field);

      press(field.element(), "+", "NumpadAdd");
      press(field.element(), "-", "NumpadSubtract");
      press(field.element(), "-", "Minus");

      expect(run.mock.calls).toEqual([["+"], ["-"]]);
    });

    it("leaves the main keyboard's hyphen and plus to the focused field", async () => {
      const add = vi.fn();
      const subtract = vi.fn();
      const screen = await renderLayer(
        <Keys
          bindings={[
            { key: "NumpadAdd", run: add, whileTyping: true },
            { key: "NumpadSubtract", run: subtract, whileTyping: true },
          ]}
          field
        />,
      );
      const field = screen.getByLabelText("Producto");

      await userEvent.click(field);
      await userEvent.keyboard("a-b");

      expect(subtract).not.toHaveBeenCalled();
      expect(add).not.toHaveBeenCalled();
      await expect.element(field).toHaveValue("a-b");
    });

    it("leaves the keypad's plus to the focused field unless the binding acts while typing", async () => {
      const add = vi.fn();
      const screen = await renderLayer(<Keys bindings={[{ key: "NumpadAdd", run: add }]} field />);
      const field = screen.getByLabelText("Producto");
      await userEvent.click(field);

      const plus = press(field.element(), "+", "NumpadAdd");

      expect(add).not.toHaveBeenCalled();
      expect(plus.defaultPrevented).toBe(false);
    });

    it("runs the keypad's plus when no field is focused", async () => {
      const add = vi.fn();
      await renderLayer(<Keys bindings={[{ key: "NumpadAdd", run: add }]} />);

      press(document.body, "+", "NumpadAdd");

      expect(add).toHaveBeenCalledTimes(1);
    });
  });

  describe("scoped to an element", () => {
    it("runs its keys while the focus is inside the element", async () => {
      const run = vi.fn();
      const screen = await renderLayer(<ScopedKeys run={run} clicked={vi.fn()} />);

      await userEvent.click(screen.getByLabelText("Producto"));
      await userEvent.keyboard("{ArrowDown}{Enter}");

      expect(run).toHaveBeenCalledTimes(2);
    });

    it("leaves its keys to the focused control outside the element", async () => {
      const run = vi.fn();
      const clicked = vi.fn();
      const screen = await renderLayer(<ScopedKeys run={run} clicked={clicked} />);

      screen.getByRole("button", { name: "Salir" }).element().focus();
      await userEvent.keyboard("{ArrowDown}{Enter}");

      expect(run).not.toHaveBeenCalled();
      expect(clicked).toHaveBeenCalledTimes(1);
    });

    it("runs its keys before a screen-wide binding registered after it", async () => {
      const run = vi.fn();
      const screenWide = vi.fn();
      const screen = await renderLayer(
        <>
          <ScopedKeys run={run} clicked={vi.fn()} />
          <Keys bindings={[{ key: "Enter", run: screenWide }]} />
        </>,
      );

      await userEvent.click(screen.getByLabelText("Producto"));
      await userEvent.keyboard("{Enter}");

      expect(run).toHaveBeenCalledOnce();
      expect(screenWide).not.toHaveBeenCalled();
    });
  });

  describe("as the frame's fallback", () => {
    it("runs the fallback when no screen binding takes the key", async () => {
      const frameRun = vi.fn();
      const screenRun = vi.fn();
      await renderLayer(
        <FrameAndScreen frameRun={frameRun} screenRun={screenRun} screenEnabled={false} />,
      );

      await userEvent.keyboard("{Escape}");

      expect(frameRun).toHaveBeenCalledTimes(1);
      expect(screenRun).not.toHaveBeenCalled();
    });

    it("leaves the key to the screen's own binding", async () => {
      const frameRun = vi.fn();
      const screenRun = vi.fn();
      await renderLayer(
        <FrameAndScreen frameRun={frameRun} screenRun={screenRun} screenEnabled={true} />,
      );

      await userEvent.keyboard("{Escape}");

      expect(screenRun).toHaveBeenCalledTimes(1);
      expect(frameRun).not.toHaveBeenCalled();
    });

    it("runs no fallback while a modal is open, even one without that key", async () => {
      const frameRun = vi.fn();
      await renderLayer(
        <>
          <Keys bindings={[{ key: "Escape", run: frameRun }]} options={{ fallback: true }} />
          <Keys bindings={[{ key: "Enter", run: vi.fn() }]} options={{ modal: true }} />
        </>,
      );

      await userEvent.keyboard("{Escape}");

      expect(frameRun).not.toHaveBeenCalled();
    });

    it("runs no fallback from inside an open dialog", async () => {
      const frameRun = vi.fn();
      await renderLayer(
        <>
          <Keys bindings={[{ key: "Escape", run: frameRun }]} options={{ fallback: true }} />
          <div role="dialog" aria-label="Aviso">
            <button type="button">Entendido</button>
          </div>
        </>,
      );

      await userEvent.click(document.querySelector("button") as HTMLElement);
      await userEvent.keyboard("{Escape}");

      expect(frameRun).not.toHaveBeenCalled();
    });

    it("leaves Enter to a focused link, which it follows", async () => {
      onTestFinished(() =>
        history.replaceState(null, "", `${location.pathname}${location.search}`),
      );
      const frameRun = vi.fn();
      const screen = await renderLayer(
        <>
          <Keys bindings={[{ key: "Enter", run: frameRun }]} options={{ fallback: true }} />
          <a href="#caja">Caja</a>
        </>,
      );

      (screen.getByRole("link", { name: "Caja" }).element() as HTMLElement).focus();
      await userEvent.keyboard("{Enter}");

      await expect.poll(() => location.hash).toBe("#caja");
      expect(frameRun).not.toHaveBeenCalled();
    });

    it.each([
      ["Enter", "{Enter}"],
      ["Space", " "],
    ] as const)("leaves %s to a focused button, which it presses", async (key, typed) => {
      const frameRun = vi.fn();
      const pressed = vi.fn();
      const screen = await renderLayer(
        <>
          <Keys bindings={[{ key, run: frameRun }]} options={{ fallback: true }} />
          <button type="button" onClick={pressed}>
            Salir
          </button>
        </>,
      );

      (screen.getByRole("button", { name: "Salir" }).element() as HTMLElement).focus();
      await userEvent.keyboard(typed);

      expect(pressed).toHaveBeenCalledOnce();
      expect(frameRun).not.toHaveBeenCalled();
    });

    it("runs no fallback for a key the focused control already handled", async () => {
      const frameRun = vi.fn();
      const screen = await renderLayer(<FieldThatHandlesEscape frameRun={frameRun} />);

      await userEvent.click(screen.getByLabelText("Producto"));
      await userEvent.keyboard("{Escape}");

      expect(frameRun).not.toHaveBeenCalled();
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
