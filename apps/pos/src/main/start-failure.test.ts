import { describe, expect, it, vi } from "vitest";
import { mainMessages } from "./messages";
import { reportStartFailure } from "./start-failure";

const REASON = "/opt/register/resources/channel.json: the channel file is not valid JSON";

function output(isPackaged: boolean) {
  return { isPackaged, writeError: vi.fn(), showErrorBox: vi.fn() };
}

describe("reportStartFailure", () => {
  it("writes the technical reason to the error output", () => {
    const out = output(true);

    reportStartFailure(REASON, out);

    expect(out.writeError).toHaveBeenCalledWith(`register not started: ${REASON}`);
  });

  it("tells staff at an installed register, in plain words, that it cannot start", () => {
    const out = output(true);

    reportStartFailure(REASON, out);

    expect(out.showErrorBox).toHaveBeenCalledWith(
      mainMessages.startFailure.title,
      mainMessages.startFailure.detail,
    );
  });

  it("never shows staff the technical reason", () => {
    const out = output(true);

    reportStartFailure(REASON, out);

    for (const text of out.showErrorBox.mock.calls.flat()) {
      expect(text).not.toContain("channel.json");
      expect(text).not.toContain("JSON");
    }
  });

  it("shows no blocking dialog in an unpackaged run, which has no staff in front of it", () => {
    const out = output(false);

    reportStartFailure(REASON, out);

    expect(out.showErrorBox).not.toHaveBeenCalled();
    expect(out.writeError).toHaveBeenCalledWith(`register not started: ${REASON}`);
  });
});
