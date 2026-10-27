const STORE_HOSTS = ["tiendista.com", "www.tiendista.com"];
const PRODUCT_DATA_ORIGIN = "https://datostienda-pc3gz7vuxa-uc.a.run.app";

export function tiendistaStoreProductDataUrl(address: string): string | null {
  const url = URL.parse(address);
  if (
    url === null ||
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    !STORE_HOSTS.includes(url.hostname) ||
    url.username !== "" ||
    url.password !== ""
  ) {
    return null;
  }
  const segments = url.pathname.split("/").slice(1);
  if (segments.at(-1) === "") {
    segments.pop();
  }
  const [segment, ...rest] = segments;
  if (segment === undefined || segment === "" || rest.length > 0) {
    return null;
  }
  let store: string;
  try {
    store = decodeURIComponent(segment);
  } catch {
    return null;
  }
  return `${PRODUCT_DATA_ORIGIN}/${encodeURIComponent(store)}/producto`;
}
