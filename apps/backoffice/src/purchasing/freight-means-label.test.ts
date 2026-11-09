import { expect, test } from "vitest";
import { freightMeansLabel } from "./freight-means-label";

test("names the carrier of a freight carried by one", () => {
  expect(freightMeansLabel({ kind: "carrier", name: "Transportes del Valle" })).toBe(
    "Transportes del Valle",
  );
});

test("says an own trip is an estimated cost", () => {
  expect(freightMeansLabel({ kind: "own_trip" })).toBe("Viaje propio · costo estimado");
});
