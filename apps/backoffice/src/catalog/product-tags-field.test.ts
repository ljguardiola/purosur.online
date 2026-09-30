import type { TagSummary } from "@purosur/contracts";
import { describe, expect, test } from "vitest";
import { tagFieldHelp, tagOptions, withCreatedTags } from "./product-tags-field";
import { organico, sinColorantes, sinTacc, vegano } from "./test-support/tags";

const dietetico: TagSummary = { ...vegano, id: "tag-7", name: "Dietético", active: false };

describe("tagOptions", () => {
  test("lists the tags by name, marking the deactivated ones as inactive", () => {
    expect(tagOptions([vegano, sinColorantes, sinTacc, organico])).toEqual([
      { value: organico.id, label: "Orgánico" },
      { value: sinColorantes.id, label: "Sin colorantes", status: "Inactivo" },
      { value: sinTacc.id, label: "Sin TACC" },
      { value: vegano.id, label: "Vegano" },
    ]);
  });
});

describe("tagFieldHelp", () => {
  test("says nothing while every chosen tag is active", () => {
    expect(tagFieldHelp([sinTacc, sinColorantes], [sinTacc.id])).toEqual({});
  });

  test("names the one chosen tag that was deactivated", () => {
    expect(tagFieldHelp([sinTacc, sinColorantes], [sinTacc.id, sinColorantes.id])).toEqual({
      description: '"Sin colorantes" está dado de baja. No se ofrece para productos nuevos.',
    });
  });

  test("names every chosen deactivated tag in one sentence, in the order chosen", () => {
    expect(
      tagFieldHelp(
        [sinColorantes, dietetico, sinTacc],
        [dietetico.id, sinTacc.id, sinColorantes.id],
      ),
    ).toEqual({
      description:
        '"Dietético" y "Sin colorantes" están dados de baja. No se ofrecen para productos nuevos.',
    });
  });

  test("joins three names with commas and a last y", () => {
    const gluten: TagSummary = { ...dietetico, id: "tag-8", name: "Sin gluten" };
    expect(
      tagFieldHelp([sinColorantes, dietetico, gluten], [sinColorantes.id, dietetico.id, gluten.id]),
    ).toEqual({
      description:
        '"Sin colorantes", "Dietético" y "Sin gluten" están dados de baja. No se ofrecen para productos nuevos.',
    });
  });
});

describe("withCreatedTags", () => {
  test("appends each created tag once", () => {
    expect(withCreatedTags([sinTacc], [vegano, organico])).toEqual([sinTacc, vegano, organico]);
    expect(withCreatedTags([sinTacc, vegano], [vegano, organico])).toEqual([
      sinTacc,
      vegano,
      organico,
    ]);
  });

  test("keeps the tags as they are when nothing was created", () => {
    const tags = [sinTacc];
    expect(withCreatedTags(tags, [])).toBe(tags);
  });
});
