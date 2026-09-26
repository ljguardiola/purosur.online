import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  type CategorySummary,
  createCategory,
  editCategory,
  fetchCategories,
} from "./categoriesApi";

function jsonResponse(status: number, body?: unknown, headers?: Record<string, string>): Response {
  return new Response(
    body === undefined ? null : JSON.stringify(body),
    headers ? { status, headers } : { status },
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const semillas: CategorySummary = {
  id: "category-1",
  name: "Semillas",
  version: 1,
  parentId: null,
};
const almacen: CategorySummary = { id: "category-2", name: "Almacén", version: 3, parentId: null };

test("fetchCategories lists every category, with its parentId, on 200", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, [semillas, almacen]));

  const outcome = await fetchCategories();

  expect(outcome).toEqual({ kind: "ok", value: [semillas, almacen] });
  expect(fetch).toHaveBeenCalledWith("/categories");
});

test("fetchCategories returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await fetchCategories()).toEqual({ kind: "unauthenticated" });
});

test("fetchCategories returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await fetchCategories()).toEqual({ kind: "forbidden" });
});

test("fetchCategories returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "45" }));

  expect(await fetchCategories()).toEqual({ kind: "rate_limited", retryAfterSeconds: 45 });
});

test("fetchCategories returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await fetchCategories()).toEqual({ kind: "failed" });
});

test("fetchCategories returns failed on a malformed body", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { not: "an array" }));

  expect(await fetchCategories()).toEqual({ kind: "failed" });
});

test("createCategory posts the name and parentId and returns the created category on 201", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(201, semillas));

  const outcome = await createCategory({ name: "Semillas", parentId: null });

  expect(outcome).toEqual({ kind: "ok", value: semillas });
  expect(fetch).toHaveBeenCalledWith("/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Semillas", parentId: null }),
  });
});

test("createCategory posts a chosen parentId as a subcategory", async () => {
  const untables: CategorySummary = {
    id: "category-3",
    name: "Untables",
    version: 1,
    parentId: "category-2",
  };
  vi.mocked(fetch).mockResolvedValue(jsonResponse(201, untables));

  const outcome = await createCategory({ name: "Untables", parentId: "category-2" });

  expect(outcome).toEqual({ kind: "ok", value: untables });
  expect(fetch).toHaveBeenCalledWith("/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Untables", parentId: "category-2" }),
  });
});

test("createCategory returns validation_failed on the name field for a 400 naming it", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, {
      code: "validation_failed",
      message: "name must not be empty",
      details: [{ field: "name" }],
    }),
  );

  expect(await createCategory({ name: "", parentId: null })).toEqual({
    kind: "validation_failed",
    field: "name",
  });
});

test("createCategory returns validation_failed on the parentId field for a vanished parent", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, {
      code: "validation_failed",
      message: "parentId must be an existing category's id or absent",
      details: [{ field: "parentId" }],
    }),
  );

  expect(await createCategory({ name: "Untables", parentId: "gone" })).toEqual({
    kind: "validation_failed",
    field: "parentId",
  });
});

test("createCategory returns name_taken on a 409 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(409, {
      code: "category_name_taken",
      message: "a category with that name already exists under that parent",
    }),
  );

  expect(await createCategory({ name: "Semillas", parentId: null })).toEqual({
    kind: "name_taken",
  });
});

test("createCategory returns parent_has_products on a 409 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(409, {
      code: "category_parent_has_products",
      message: "the parent category has products assigned; move them before adding a subcategory",
    }),
  );

  expect(await createCategory({ name: "Untables", parentId: "category-2" })).toEqual({
    kind: "parent_has_products",
  });
});

test("createCategory returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(await createCategory({ name: "Semillas", parentId: null })).toEqual({
    kind: "unauthenticated",
  });
});

test("createCategory returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(await createCategory({ name: "Semillas", parentId: null })).toEqual({
    kind: "forbidden",
  });
});

test("createCategory returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "30" }));

  expect(await createCategory({ name: "Semillas", parentId: null })).toEqual({
    kind: "rate_limited",
    retryAfterSeconds: 30,
  });
});

test("createCategory returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(await createCategory({ name: "Semillas", parentId: null })).toEqual({ kind: "failed" });
});

test("editCategory posts the name, parentId and version and returns the applied category on 200", async () => {
  const renamed: CategorySummary = {
    id: "category-1",
    name: "Semillas y granos",
    version: 2,
    parentId: null,
  };
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, renamed));

  const outcome = await editCategory("category-1", {
    name: "Semillas y granos",
    parentId: null,
    version: 1,
  });

  expect(outcome).toEqual({ kind: "ok", value: renamed });
  expect(fetch).toHaveBeenCalledWith("/categories/category-1/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Semillas y granos", parentId: null, version: 1 }),
  });
});

test("editCategory posts a chosen parentId when moving the category", async () => {
  const moved: CategorySummary = {
    id: "category-3",
    name: "Untables",
    version: 2,
    parentId: "category-2",
  };
  vi.mocked(fetch).mockResolvedValue(jsonResponse(200, moved));

  const outcome = await editCategory("category-3", {
    name: "Untables",
    parentId: "category-2",
    version: 1,
  });

  expect(outcome).toEqual({ kind: "ok", value: moved });
  expect(fetch).toHaveBeenCalledWith("/categories/category-3/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Untables", parentId: "category-2", version: 1 }),
  });
});

test("editCategory returns validation_failed on the name field for a 400", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, {
      code: "validation_failed",
      message: "name must not be empty",
      details: [{ field: "name" }],
    }),
  );

  expect(await editCategory("category-1", { name: "", parentId: null, version: 1 })).toEqual({
    kind: "validation_failed",
    field: "name",
  });
});

test("editCategory returns validation_failed on the parentId field for a vanished parent", async () => {
  vi.mocked(fetch).mockResolvedValue(
    jsonResponse(400, {
      code: "validation_failed",
      message: "parentId must be an existing category's id or absent",
      details: [{ field: "parentId" }],
    }),
  );

  expect(
    await editCategory("category-1", { name: "Semillas", parentId: "gone", version: 1 }),
  ).toEqual({ kind: "validation_failed", field: "parentId" });
});

test("editCategory returns not_found on 404", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(404, { code: "not_found" }));

  expect(
    await editCategory("category-1", { name: "Semillas", parentId: null, version: 1 }),
  ).toEqual({ kind: "not_found" });
});

test("editCategory returns stale_version on a 409 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "stale_version" }));

  expect(
    await editCategory("category-1", { name: "Semillas", parentId: null, version: 1 }),
  ).toEqual({ kind: "stale_version" });
});

test("editCategory returns name_taken on a 409 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "category_name_taken" }));

  expect(
    await editCategory("category-1", { name: "Semillas", parentId: null, version: 1 }),
  ).toEqual({ kind: "name_taken" });
});

test("editCategory returns parent_has_products on a 409 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "category_parent_has_products" }));

  expect(
    await editCategory("category-1", { name: "Semillas", parentId: "category-2", version: 1 }),
  ).toEqual({ kind: "parent_has_products" });
});

test("editCategory returns move_not_allowed on a 409 carrying that code", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(409, { code: "category_move_not_allowed" }));

  expect(
    await editCategory("category-1", { name: "Semillas", parentId: "category-2", version: 1 }),
  ).toEqual({ kind: "move_not_allowed" });
});

test("editCategory returns unauthenticated on 401", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(401));

  expect(
    await editCategory("category-1", { name: "Semillas", parentId: null, version: 1 }),
  ).toEqual({ kind: "unauthenticated" });
});

test("editCategory returns forbidden on 403", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(403));

  expect(
    await editCategory("category-1", { name: "Semillas", parentId: null, version: 1 }),
  ).toEqual({ kind: "forbidden" });
});

test("editCategory returns rate_limited with the Retry-After header on 429", async () => {
  vi.mocked(fetch).mockResolvedValue(jsonResponse(429, undefined, { "Retry-After": "15" }));

  expect(
    await editCategory("category-1", { name: "Semillas", parentId: null, version: 1 }),
  ).toEqual({ kind: "rate_limited", retryAfterSeconds: 15 });
});

test("editCategory returns failed when the request throws", async () => {
  vi.mocked(fetch).mockRejectedValue(new Error("network down"));

  expect(
    await editCategory("category-1", { name: "Semillas", parentId: null, version: 1 }),
  ).toEqual({ kind: "failed" });
});
