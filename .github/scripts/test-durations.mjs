import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative } from "node:path";
import { BaseSequencer } from "vitest/node";
import { decodeDurations } from "./test-durations-payload.mjs";

export function durationKey(projectName, relativeModuleId) {
  return `${projectName}:${relativeModuleId.replaceAll("\\", "/")}`;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weigh(entries, durations) {
  const known = entries.filter((e) => e.key in durations);
  const globalMean = known.length > 0 ? mean(known.map((e) => durations[e.key])) : 1;
  const projectMeans = new Map();
  for (const project of new Set(known.map((e) => e.project))) {
    projectMeans.set(
      project,
      mean(known.filter((e) => e.project === project).map((e) => durations[e.key])),
    );
  }
  return entries.map((e) => ({
    entry: e,
    measured: e.key in durations,
    weight: durations[e.key] ?? projectMeans.get(e.project) ?? globalMean,
  }));
}

export function shardPlan(entries, durations, { index, count }) {
  const weighed = weigh(entries, durations).sort(
    (a, b) => b.weight - a.weight || (a.entry.key < b.entry.key ? -1 : 1),
  );
  const projects = [...new Set(weighed.map((file) => file.entry.project))].sort();
  const shards = Array.from({ length: count }, () => ({ load: 0, files: [] }));
  for (const project of projects) {
    const projectLoads = shards.map(() => 0);
    for (const file of weighed.filter((f) => f.entry.project === project)) {
      let target = 0;
      for (let i = 1; i < count; i++) {
        const byProject = projectLoads[i] - projectLoads[target];
        const byTotal = shards[i].load - shards[target].load;
        const byFiles = shards[i].files.length - shards[target].files.length;
        if ((byProject || byTotal || byFiles) < 0) target = i;
      }
      projectLoads[target] += file.weight;
      shards[target].load += file.weight;
      shards[target].files.push(file);
    }
  }
  const mine = shards[index - 1];
  return {
    entries: mine.files.map((f) => f.entry),
    estimatedMs: mine.load,
    measuredCount: mine.files.filter((f) => f.measured).length,
  };
}

export function durationBalancedSequencer(durationsPayload) {
  return class DurationBalancedSequencer extends BaseSequencer {
    async shard(files) {
      const { root, shard } = this.ctx.config;
      const byKey = new Map();
      for (const spec of files) {
        const key = durationKey(spec.project.name, relative(root, spec.moduleId));
        byKey.set(key, spec);
      }
      const entries = [...byKey.entries()].map(([key, spec]) => ({
        key,
        project: spec.project.name,
      }));
      const durations = decodeDurations(durationsPayload);
      const plan = shardPlan(entries, durations, shard);
      const position = `test-durations: shard ${shard.index}/${shard.count} runs ${plan.entries.length} files`;
      this.ctx.logger.log(
        Object.keys(durations).length === 0
          ? `${position} without durations, split by file count`
          : `${position}, about ${Math.round(plan.estimatedMs / 1000)}s, ` +
              `${plan.measuredCount} with a measured duration`,
      );
      return plan.entries.map((e) => byKey.get(e.key));
    }
  };
}

export class TestDurationsReporter {
  #outputFile;

  constructor({ outputFile }) {
    this.#outputFile = outputFile;
  }

  async onTestRunEnd(testModules) {
    if (!this.#outputFile) return;
    const durations = {};
    for (const module of testModules) {
      const diagnostic = module.diagnostic();
      if (!diagnostic) continue;
      durations[durationKey(module.project.name, module.relativeModuleId)] = Math.round(
        diagnostic.duration +
          diagnostic.collectDuration +
          diagnostic.setupDuration +
          diagnostic.prepareDuration +
          diagnostic.environmentSetupDuration,
      );
    }
    await mkdir(dirname(this.#outputFile), { recursive: true });
    await writeFile(this.#outputFile, JSON.stringify(durations));
  }
}
