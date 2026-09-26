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
