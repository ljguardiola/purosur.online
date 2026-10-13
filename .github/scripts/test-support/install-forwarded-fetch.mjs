import { forwardBucketFetch } from "./forward-bucket-fetch.mjs";

globalThis.fetch = forwardBucketFetch(
  Number(process.env.FAKE_BUCKET_PORT),
  process.env.POS_UPDATES_BUCKET_NAME,
);
