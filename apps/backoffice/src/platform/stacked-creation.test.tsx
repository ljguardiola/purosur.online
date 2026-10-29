import { expect, test, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import { useStackedCreation } from "./stacked-creation";

type Record = { id: string; name: string };
const serenisima: Record = { id: "r-1", name: "Serenísima" };

function setup() {
  const choose = vi.fn();
  const catalog = { markStale: vi.fn().mockResolvedValue(undefined), refresh: vi.fn() };
  return { choose, catalog, ...renderHook(() => useStackedCreation<Record>(choose, catalog)) };
}

test("starts closed with no record created and no name", async () => {
  const { result } = await setup();

  expect(result.current).toMatchObject({ open: false, created: null, initialName: "" });
});

test("starting opens the creation with the typed name as its initial name", async () => {
  const { result, act } = await setup();

  await act(() => result.current.start("Serenísima"));

  expect(result.current).toMatchObject({ open: true, initialName: "Serenísima" });
});

test("selecting the created record chooses it, closes the creation and marks the catalog stale without reading it", async () => {
  const { result, act, choose, catalog } = await setup();
  await act(() => result.current.start("Serenísima"));

  await act(() => result.current.select(serenisima));

  expect(choose).toHaveBeenCalledWith(serenisima);
  expect(result.current).toMatchObject({ open: false, created: serenisima });
  expect(catalog.markStale).toHaveBeenCalledTimes(1);
  expect(catalog.refresh).not.toHaveBeenCalled();
});

test("finishing the host form reads the catalog again only when a record was created", async () => {
  const { result, act, catalog } = await setup();

  await act(() => result.current.finish());
  expect(catalog.refresh).not.toHaveBeenCalled();

  await act(() => result.current.select(serenisima));
  await act(() => result.current.finish());
  expect(catalog.refresh).toHaveBeenCalledTimes(1);
});

test("closing keeps nothing created, and resetting forgets the created record", async () => {
  const { result, act } = await setup();
  await act(() => result.current.start("Serenísima"));
  await act(() => result.current.close());
  expect(result.current).toMatchObject({ open: false, created: null });

  await act(() => result.current.select(serenisima));
  await act(() => result.current.reset());
  expect(result.current).toMatchObject({ open: false, created: null });
});
