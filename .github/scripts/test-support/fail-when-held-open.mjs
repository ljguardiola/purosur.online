export function failWhenHeldOpen(milliseconds) {
  setTimeout(() => {
    const holders = process.getActiveResourcesInfo().join(", ");
    console.error(`still held open ${milliseconds} ms after its tests finished, by: ${holders}`);
    process.exit(1);
  }, milliseconds).unref();
}
