import { NextRequest } from "next/server";
import { getDocument, getVersion, subscribe, type StoreMessage } from "@/lib/server-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/document/stream — Server-Sent Events.
 * Emits the full document on connect and after every mutation. The payload
 * carries `origin` (the client-id that caused the change) so a client can
 * ignore echoes of its own edits.
 */
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (msg: StoreMessage) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
        } catch {
          /* controller closed */
        }
      };

      // Initial full snapshot, then live deltas.
      send({ kind: "snapshot", version: getVersion(), document: await getDocument(), origin: null });

      const unsub = subscribe((msg) => send(msg));

      // Heartbeat to keep the connection alive through proxies.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* ignore */
        }
      }, 15000);

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
