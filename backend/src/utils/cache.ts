type CacheInvalidator = (hostelId?: string) => void;

const invalidators: CacheInvalidator[] = [];

/**
 * Register a subsystem cache invalidation handler (e.g. rooms, fees, snapshots, dashboard).
 */
export function registerCacheInvalidator(fn: CacheInvalidator): void {
  invalidators.push(fn);
}

/**
 * Invalidate all in-memory caches related to a hostel (or all hostels) when any mutation occurs.
 */
export function invalidateHostelCaches(hostelId?: string | string[]): void {
  const ids = Array.isArray(hostelId) ? hostelId : hostelId ? [hostelId] : [undefined];
  for (const id of ids) {
    for (const fn of invalidators) {
      try {
        fn(id);
      } catch (err) {
        console.warn("[Cache] Invalidator failed:", err);
      }
    }
  }
}
