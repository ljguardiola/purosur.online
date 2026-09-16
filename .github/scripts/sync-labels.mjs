// Pure decision logic behind the "Sync labels" workflow
// (`.github/workflows/sync-labels.yml`). It never deletes a label: a label
// this repository does not declare in `.github/labels.json` is left alone,
// because a label the workflow does not know about might be in active use
// for something else.

export function planLabelSync(existingLabels, desiredLabels) {
  const existingByName = new Map((existingLabels ?? []).map((label) => [label.name, label]));

  const toCreate = [];
  const toUpdate = [];

  for (const desired of desiredLabels ?? []) {
    const existing = existingByName.get(desired.name);
    if (!existing) {
      toCreate.push(desired);
      continue;
    }
    const colorMatches = existing.color === desired.color;
    const descriptionMatches = (existing.description ?? "") === (desired.description ?? "");
    if (!colorMatches || !descriptionMatches) {
      toUpdate.push(desired);
    }
  }

  return { toCreate, toUpdate };
}
