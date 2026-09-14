/**
 * Bounded-parallel map — run an async fn over items with at most `limit`
 * in flight at once. Results land in input order.
 *
 * The pipeline tick does several serial per-item network calls (VAPI,
 * Twilio, Resend, Claude summaries). Serial execution pushes the tick past
 * Vercel's function timeout on busy ticks, which kills the invocation and
 * drops the HTTP response mid-flight. Bounded parallelism keeps each pass
 * fast without hammering downstream APIs.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
