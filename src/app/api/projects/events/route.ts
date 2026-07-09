import { NextRequest } from 'next/server';
import { ProjectEvent, subscribeProjectEvents } from '../../../../lib/projectEvents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function encodeEvent(event: ProjectEvent) {
  return `id: ${event.id}\nevent: project\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(': connected\n\n'));

      const unsubscribe = subscribeProjectEvents((event) => {
        controller.enqueue(encoder.encode(encodeEvent(event)));
      });

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': keep-alive\n\n'));
      }, 25000);

      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
