import assert from "node:assert/strict";
import { test } from "node:test";
import { releaseImagePromoted } from "./release-image.mjs";

function fakeRegistry({ tokenResponse, manifestResponse }) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const response = url.startsWith("https://ghcr.io/token") ? tokenResponse : manifestResponse;
      if (response instanceof Error) throw response;
      return response;
    },
  };
}

function response(status, body) {
  return { status, json: async () => body };
}

const GRANTED = response(200, { token: "registry-token" });

test("asks the registry for the release tag's manifest with a pull token for the cloud image", async () => {
  const { fetchImpl, calls } = fakeRegistry({
    tokenResponse: GRANTED,
    manifestResponse: response(200),
  });

  await releaseImagePromoted({ tag: "cloud-v1.0.0", token: "workflow-token", fetchImpl });

  assert.equal(
    calls[0].url,
    "https://ghcr.io/token?service=ghcr.io&scope=repository%3Aljguardiola%2Fpurosur-cloud%3Apull",
  );
  assert.equal(
    calls[0].options.headers.Authorization,
    `Basic ${Buffer.from("release:workflow-token").toString("base64")}`,
  );
  assert.equal(calls[1].url, "https://ghcr.io/v2/ljguardiola/purosur-cloud/manifests/cloud-v1.0.0");
  assert.equal(calls[1].options.method, "HEAD");
  assert.equal(calls[1].options.headers.Authorization, "Bearer registry-token");
  assert.match(calls[1].options.headers.Accept, /application\/vnd\.oci\.image\.index\.v1\+json/);
});

test("a release tag the registry holds was promoted", async () => {
  const { fetchImpl } = fakeRegistry({ tokenResponse: GRANTED, manifestResponse: response(200) });

  assert.equal(
    await releaseImagePromoted({ tag: "cloud-v1.0.0", token: "workflow-token", fetchImpl }),
    true,
  );
});

test("a release tag the registry does not hold was never promoted", async () => {
  const { fetchImpl } = fakeRegistry({ tokenResponse: GRANTED, manifestResponse: response(404) });

  assert.equal(
    await releaseImagePromoted({ tag: "cloud-v1.1.0", token: "workflow-token", fetchImpl }),
    false,
  );
});

test("an answer that is neither found nor not found is a failure, never a missing release", async () => {
  const failures = [
    { tokenResponse: new Error("network down"), manifestResponse: response(200) },
    { tokenResponse: response(401, {}), manifestResponse: response(200) },
    { tokenResponse: response(200, {}), manifestResponse: response(200) },
    { tokenResponse: GRANTED, manifestResponse: new Error("network down") },
    { tokenResponse: GRANTED, manifestResponse: response(401) },
    { tokenResponse: GRANTED, manifestResponse: response(500) },
  ];
  for (const failure of failures) {
    const { fetchImpl } = fakeRegistry(failure);
    await assert.rejects(
      releaseImagePromoted({ tag: "cloud-v1.0.0", token: "workflow-token", fetchImpl }),
      /cloud-v1\.0\.0/,
    );
  }
});
