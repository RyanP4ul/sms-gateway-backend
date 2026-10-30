/**
 * Server-sent events helper. Pushes `produce()` every `intervalMs`, ends after `maxMs`
 * (clients reconnect), and stops cleanly when the client disconnects.
 */
export function sseResponse(
  signal: AbortSignal,
  opts: { intervalMs: number; maxMs: number; closeData: string },
  produce: () => Promise<unknown>,
): Response {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      let busy = false;
      const end = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        try { controller.close(); } catch { /* already closed */ }
      };
      const tick = async () => {
        if (closed || busy) return;
        busy = true;
        try {
          if (Date.now() - startedAt >= opts.maxMs) {
            controller.enqueue(encoder.encode(`event: close\ndata: ${opts.closeData}\n\n`));
            return end();
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(await produce())}\n\n`));
        } catch (error) {
          console.error('SSE error:', error);
          end();
        } finally {
          busy = false;
        }
      };
      signal.addEventListener('abort', end, { once: true });
      await tick();
      if (!closed) timer = setInterval(tick, opts.intervalMs);
    },
    cancel() {
      closed = true;
      clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' },
  });
}
