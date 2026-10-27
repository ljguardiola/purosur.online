import { afterEach, expect, test, vi } from "vitest";
import { render } from "../shell/test-support/render-with-router";
import { QrCameraScanner, type QrDecoder } from "./qr-camera-scanner";

afterEach(() => {
  vi.restoreAllMocks();
});

function cameraStream() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 48;
  const context = canvas.getContext("2d");
  const stream = canvas.captureStream(30);
  if (context !== null) {
    context.fillStyle = "rgb(40, 90, 160)";
    context.fillRect(0, 0, 64, 48);
  }
  const [track] = stream.getVideoTracks();
  if (track === undefined) {
    throw new Error("the fake camera has no video track");
  }
  const stop = vi.spyOn(track, "stop");
  return { stream, stop };
}

function useCamera(getUserMedia: () => Promise<MediaStream>) {
  const request = vi.fn(getUserMedia);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: request },
  });
  return request;
}

function decoderReading(...texts: (string | null)[]): QrDecoder {
  const queue = [...texts];
  return vi.fn(async () => (queue.length > 0 ? (queue.shift() ?? null) : null));
}

test("asks for the camera facing the person's table and shows what it sees", async () => {
  const { stream } = cameraStream();
  const request = useCamera(async () => stream);

  const screen = await render(
    <QrCameraScanner onCode={vi.fn()} onUnavailable={vi.fn()} decoder={decoderReading()} />,
  );

  await expect.element(screen.getByLabelText("Cámara")).toBeVisible();
  expect(request).toHaveBeenCalledWith({ video: { facingMode: "environment" } });
});

test("reports a code the decoder reads from the camera", async () => {
  const { stream } = cameraStream();
  useCamera(async () => stream);
  const onCode = vi.fn();

  await render(
    <QrCameraScanner onCode={onCode} onUnavailable={vi.fn()} decoder={decoderReading("QR-1")} />,
  );

  await vi.waitFor(() => expect(onCode).toHaveBeenCalledWith("QR-1"));
});

const A_SECOND_WITHOUT_THE_CODE: null[] = Array.from({ length: 10 }, () => null);

test("reports a code once while it stays in front of the camera and again after it left", async () => {
  const { stream } = cameraStream();
  useCamera(async () => stream);
  const onCode = vi.fn();

  await render(
    <QrCameraScanner
      onCode={onCode}
      onUnavailable={vi.fn()}
      decoder={decoderReading("QR-1", "QR-1", ...A_SECOND_WITHOUT_THE_CODE, "QR-1", "QR-2")}
    />,
  );

  await vi.waitFor(() => expect(onCode).toHaveBeenCalledTimes(3), { timeout: 5000 });
  expect(onCode.mock.calls).toEqual([["QR-1"], ["QR-1"], ["QR-2"]]);
});

test("reports a code once when a few frames in front of the camera could not be read", async () => {
  const { stream } = cameraStream();
  useCamera(async () => stream);
  const onCode = vi.fn();
  const frames = ["QR-1", null, "QR-1", null, null, "QR-1"];
  const decoder = decoderReading(...frames);

  await render(<QrCameraScanner onCode={onCode} onUnavailable={vi.fn()} decoder={decoder} />);

  await vi.waitFor(() => expect(decoder).toHaveBeenCalledTimes(frames.length + 1));
  expect(onCode.mock.calls).toEqual([["QR-1"]]);
});

test("says the camera was denied when the person refuses it", async () => {
  useCamera(async () => {
    throw new DOMException("denied", "NotAllowedError");
  });
  const onUnavailable = vi.fn();

  await render(
    <QrCameraScanner onCode={vi.fn()} onUnavailable={onUnavailable} decoder={decoderReading()} />,
  );

  await vi.waitFor(() => expect(onUnavailable).toHaveBeenCalledWith("denied"));
});

test("says there is no camera when the device has none", async () => {
  useCamera(async () => {
    throw new DOMException("none", "NotFoundError");
  });
  const onUnavailable = vi.fn();

  await render(
    <QrCameraScanner onCode={vi.fn()} onUnavailable={onUnavailable} decoder={decoderReading()} />,
  );

  await vi.waitFor(() => expect(onUnavailable).toHaveBeenCalledWith("no_camera"));
});

test("says there is no camera when the browser offers no way to ask for one", async () => {
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
  const onUnavailable = vi.fn();

  await render(
    <QrCameraScanner onCode={vi.fn()} onUnavailable={onUnavailable} decoder={decoderReading()} />,
  );

  await vi.waitFor(() => expect(onUnavailable).toHaveBeenCalledWith("no_camera"));
});

test("stops the camera when it is no longer shown", async () => {
  const { stream, stop } = cameraStream();
  useCamera(async () => stream);
  const screen = await render(
    <QrCameraScanner onCode={vi.fn()} onUnavailable={vi.fn()} decoder={decoderReading()} />,
  );
  await expect.element(screen.getByLabelText("Cámara")).toBeVisible();

  await screen.unmount();

  expect(stop).toHaveBeenCalled();
});

test("stops a camera that was granted after the scanner was already gone", async () => {
  const { stream, stop } = cameraStream();
  let grant: (granted: MediaStream) => void = () => {};
  useCamera(
    () =>
      new Promise<MediaStream>((resolve) => {
        grant = resolve;
      }),
  );
  const screen = await render(
    <QrCameraScanner onCode={vi.fn()} onUnavailable={vi.fn()} decoder={decoderReading()} />,
  );

  await screen.unmount();
  grant(stream);

  await vi.waitFor(() => expect(stop).toHaveBeenCalled());
});
