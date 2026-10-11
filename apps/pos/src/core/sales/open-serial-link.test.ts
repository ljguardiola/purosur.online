import { describe, expect, it, vi } from "vitest";
import { openSerialLink } from "./open-serial-link";

type CreatePort = NonNullable<Parameters<typeof openSerialLink>[1]>;
type PortOptions = Parameters<CreatePort>[0];

function fakePort({ openFailure }: { openFailure?: Error } = {}) {
  const listeners = new Map<string, ((chunk: Uint8Array) => void)[]>();
  const port = {
    isOpen: false,
    options: undefined as PortOptions | undefined,
    written: [] as number[][],
    closes: 0,
    open(callback: (error: Error | null) => void) {
      port.isOpen = openFailure === undefined;
      callback(openFailure ?? null);
    },
    write(data: Uint8Array) {
      port.written.push([...data]);
    },
    on(event: "data" | "error" | "close", listener: (chunk: Uint8Array) => void) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    },
    close() {
      port.closes += 1;
      port.isOpen = false;
    },
    emit(event: "data" | "error" | "close", chunk: Uint8Array) {
      for (const listener of listeners.get(event) ?? []) listener(chunk);
    },
  };
  const createPort = vi.fn(async (options: PortOptions) => {
    port.options = options;
    return port;
  });
  return { port, createPort };
}

describe("the serial link to the scale", () => {
  it("opens the port at its path at 9600 bauds, 8 data bits, no parity and 1 stop bit", async () => {
    const { port, createPort } = fakePort();

    await openSerialLink("COM3", createPort);

    expect(createPort).toHaveBeenCalledOnce();
    expect(port.options).toMatchObject({
      path: "COM3",
      baudRate: 9600,
      dataBits: 8,
      parity: "none",
      stopBits: 1,
    });
    expect(port.isOpen).toBe(true);
  });

  it("fails when the port cannot be opened", async () => {
    const { createPort } = fakePort({ openFailure: new Error("access denied") });

    await expect(openSerialLink("COM3", createPort)).rejects.toThrow("access denied");
  });

  it("writes to the port and passes on what the port receives, its errors and its closing", async () => {
    const { port, createPort } = fakePort();
    const link = await openSerialLink("COM3", createPort);
    const heard: [string, number[]][] = [];
    link.on("data", (chunk) => heard.push(["data", [...chunk]]));
    link.on("error", () => heard.push(["error", []]));
    link.on("close", () => heard.push(["close", []]));

    link.write(Uint8Array.of(0x05));
    port.emit("data", Uint8Array.of(0x02, 0x30));
    port.emit("error", Uint8Array.of());
    port.emit("close", Uint8Array.of());

    expect(port.written).toEqual([[0x05]]);
    expect(heard).toEqual([
      ["data", [0x02, 0x30]],
      ["error", []],
      ["close", []],
    ]);
  });

  it("closes the port only while it is open", async () => {
    const { port, createPort } = fakePort();
    const link = await openSerialLink("COM3", createPort);

    link.close();
    link.close();

    expect(port.closes).toBe(1);
  });
});
