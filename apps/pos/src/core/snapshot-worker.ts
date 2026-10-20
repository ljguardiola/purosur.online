import { setTimeout as sleep } from "node:timers/promises";
import { snapshotWorkerJobSchema } from "@purosur/contracts";
import { net } from "electron";
import { endRestoreWorker } from "./backups/restore-worker-message";
import { runRestoreJob } from "./backups/run-restore-job";
import { runSnapshotJob } from "./register/run-snapshot-job";
import { endSnapshotWorker } from "./register/snapshot-worker-message";

process.parentPort.once("message", (event) => {
  const job = snapshotWorkerJobSchema.safeParse(event.data);
  if (!job.success) {
    console.error("snapshot worker: refused a job it could not read");
    process.exit(1);
  }
  const cloud = {
    cloudUrl: job.data.cloud_url,
    fetch: (input: string, init: RequestInit) => net.fetch(input, init),
    sleep,
  };
  if (job.data.kind === "restore") {
    runRestoreJob(job.data, { cloud }).then(
      (outcome) => {
        if (outcome.kind === "none_usable") {
          console.error("snapshot worker: no generation could be restored", outcome.failures);
        } else if (outcome.kind === "restored" && outcome.failures.length > 0) {
          console.error(
            "snapshot worker: restored after newer generations failed",
            outcome.failures,
          );
        }
        endRestoreWorker(outcome, { post: (message) => process.parentPort.postMessage(message) });
      },
      (error: unknown) => {
        console.error("snapshot worker: failed", error);
        process.exit(1);
      },
    );
    return;
  }
  runSnapshotJob(job.data, {
    cloud,
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
      endSnapshotWorker(result, {
        post: (message) => process.parentPort.postMessage(message),
        exit: (code) => process.exit(code),
      });
    },
    (error: unknown) => {
      console.error("snapshot worker: failed", error);
      process.exit(1);
    },
  );
});
