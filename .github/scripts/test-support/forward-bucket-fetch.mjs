export function forwardBucketFetch(port, bucketName) {
  const send = fetch;
  return async (request) => {
    const url = new URL(request.url);
    if (!url.host.startsWith(`${bucketName}.`)) {
      throw new Error(`${request.url} does not address the bucket by its host name`);
    }
    const local = `http://127.0.0.1:${port}/${bucketName}${url.pathname}${url.search}`;
    return send(new Request(local, request), { duplex: "half" });
  };
}
