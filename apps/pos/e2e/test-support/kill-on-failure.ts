// Closing a register waits for its main process to quit, with no limit; one whose bounded wait failed
// may never quit, so it is killed and the wait's failure reaches the run.
export async function killOnFailure(
  app: { process(): { kill(): boolean } },
  wait: () => Promise<void>,
): Promise<void> {
  try {
    await wait();
  } catch (error) {
    app.process().kill();
    throw error;
  }
}
