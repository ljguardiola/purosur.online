import { IMAGE_REPOSITORY } from "./staging-validated-image.mjs";

const LOG_PREFIX = "release-image";
const REQUEST_TIMEOUT_MS = 30_000;
const MANIFEST_TYPES = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
];

function registryParts() {
  const separator = IMAGE_REPOSITORY.indexOf("/");
  return {
    host: IMAGE_REPOSITORY.slice(0, separator),
    repository: IMAGE_REPOSITORY.slice(separator + 1),
  };
}

async function request(fetchImpl, url, options, tag) {
  try {
    return await fetchImpl(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    throw new Error(
      `${LOG_PREFIX}: could not ask the registry about ${tag}: ${error instanceof Error ? error.message : error}`,
    );
  }
}

async function pullToken({ host, repository, tag, token, fetchImpl }) {
  const scope = encodeURIComponent(`repository:${repository}:pull`);
  const response = await request(
    fetchImpl,
    `https://${host}/token?service=${host}&scope=${scope}`,
    { headers: { Authorization: `Basic ${Buffer.from(`release:${token}`).toString("base64")}` } },
    tag,
  );
  const body = response.status === 200 ? await response.json().catch(() => undefined) : undefined;
  if (typeof body?.token !== "string") {
    throw new Error(
      `${LOG_PREFIX}: the registry granted no pull token to ask about ${tag} (status ${response.status})`,
    );
  }
  return body.token;
}

export async function releaseImagePromoted({ tag, token, fetchImpl = fetch }) {
  const { host, repository } = registryParts();
  const registryToken = await pullToken({ host, repository, tag, token, fetchImpl });
  const response = await request(
    fetchImpl,
    `https://${host}/v2/${repository}/manifests/${encodeURIComponent(tag)}`,
    {
      method: "HEAD",
      headers: { Authorization: `Bearer ${registryToken}`, Accept: MANIFEST_TYPES.join(", ") },
    },
    tag,
  );
  if (response.status === 200) return true;
  if (response.status === 404) return false;
  throw new Error(`${LOG_PREFIX}: the registry answered status ${response.status} for ${tag}`);
}
