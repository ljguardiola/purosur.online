/** Not a real secret: only ever derives tokens inside tests. */
export const TEST_DEVICE_TOKEN_ROTATION_KEY = Buffer.alloc(32, 9);
