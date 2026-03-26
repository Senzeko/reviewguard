/**
 * src/server/routes/sse.ts
 *
 * Server-Sent Events endpoint for real-time dashboard updates.
 * Clients connect to GET /api/sse/events and receive typed events:
 *   - review:new       — new review received
 *   - review:scored    — engine scoring complete
 *   - review:confirmed — human confirmed
 *   - pdf:ready        — dispute PDF generated
 *   - sync:complete    — POS sync finished
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface SSEClient {
  merchantId: string;
  reply: FastifyReply;
}

const clients: Set<SSEClient> = new Set();

export function broadcastSSE(merchantId: string, event: string, data: Record<string, unknown>): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    if (client.merchantId === merchantId) {
      try {
        client.reply.raw.write(payload);
      } catch {
        clients.delete(client);
      }
    }
  }
}

export async function sseRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/events', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user?.merchantId) {
      return reply.status(403).send({ error: 'No merchant linked' });
    }

    const merchantId = request.user.merchantId;

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx
    });

    // Send initial heartbeat
    reply.raw.write(`event: connected\ndata: {"merchantId":"${merchantId}"}\n\n`);

    const client: SSEClient = { merchantId, reply };
    clients.add(client);

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(`:heartbeat\n\n`);
      } catch {
        clearInterval(heartbeat);
        clients.delete(client);
      }
    }, 30_000);

    // Cleanup on disconnect
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(client);
    });

    // Don't let Fastify close the response
    await new Promise(() => {}); // eslint-disable-line @typescript-eslint/no-empty-function
  });
}
