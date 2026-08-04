/**
 * Marker stage for projects parked in a bulk batch.
 *
 * Lives in its own module so the automation routes (which create batches) and
 * the queue workers (which drain them) can share it without importing each
 * other — routes already depend on the queue, so the reverse would be a cycle.
 */
export const BATCH_STAGE = "batch:queued";
