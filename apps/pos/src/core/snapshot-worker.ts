import { setTimeout as sleep } from "node:timers/promises";
import { snapshotWorkerJobSchema } from "@purosur/contracts";
import { net } from "electron";
import { runSnapshotJob } from "./register/run-snapshot-job";

process.parentPort.once("message", (event) => {
  const job = snapshotWorkerJobSchema.safeParse(event.data);
  if (!job.success) {
    console.error("snapshot worker: refused a job it could not read");
    process.exit(1);
  }
  runSnapshotJob(job.data, {
    cloud: {
      cloudUrl: job.data.cloud_url,
      fetch: (input, init) => net.fetch(input, init),
      sleep,
    },
    now: () => new Date(),
  }).then(
    (result) => {
      if (result.kind === "aborted") {
        console.error(
          `snapshot worker: the copy failed its ${result.stage}, so the run was aborted`,
        );
      } else {
        console.info("snapshot worker: finished", result.uploads);
      }
      process.exit(result.kind === "aborted" ? 1 : 0);
    },
    (error: unknown) => {
      console.error("snapshot worker: failed", error);
      process.exit(1);
    },
  );
});
