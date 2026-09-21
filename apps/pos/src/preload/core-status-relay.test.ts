import { describe, expect, it, vi } from "vitest";
import { CORE_STATUS_REQUEST } from "../shared/core-status-request";
import { createCoreStatusRelay } from "./core-status-relay";

const down = { type: "core-status", status: "down" };
const up = { type: "core-status", status: "up" };

describe("createCoreStatusRelay", () => {
  it("relays every status main sends to the page", () => {
    const postToPage = vi.fn();
    const relay = createCoreStatusRelay(postToPage);

    relay.fromMain(down);
    relay.fromMain(up);

    expect(postToPage.mock.calls).toEqual([
      [{ channel: "core-status", payload: down }],
      [{ channel: "core-status", payload: up }],
    ]);
  });

  it("replays the latest status when the page asks for it after it arrived", () => {
    const postToPage = vi.fn();
    const relay = createCoreStatusRelay(postToPage);

    relay.fromMain(up);
    relay.fromMain(down);
    postToPage.mockClear();
    relay.fromPage(structuredClone(CORE_STATUS_REQUEST));

    expect(postToPage).toHaveBeenCalledExactlyOnceWith({ channel: "core-status", payload: down });
  });

  it("has nothing to replay before main has sent any status", () => {
    const postToPage = vi.fn();
    const relay = createCoreStatusRelay(postToPage);

    relay.fromPage(CORE_STATUS_REQUEST);

    expect(postToPage).not.toHaveBeenCalled();
  });

  it("ignores every other page message, including its own relayed statuses", () => {
    const postToPage = vi.fn();
    const relay = createCoreStatusRelay(postToPage);

    relay.fromMain(down);
    postToPage.mockClear();
    relay.fromPage({ channel: "core-status", payload: down });
    relay.fromPage("core-port");
    relay.fromPage(null);

    expect(postToPage).not.toHaveBeenCalled();
  });
});
