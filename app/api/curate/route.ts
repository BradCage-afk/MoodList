import { auth } from "@/auth";
import { curate, type CurateInput } from "@/lib/curate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/curate — Server-Sent Events stream of pipeline progress.
 * The Response (with its ReadableStream) is returned immediately; the
 * pipeline pushes events into the stream as stages complete.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.accessToken || session.error) {
    return Response.json({ error: "Not authenticated with Spotify" }, { status: 401 });
  }
  const accessToken = session.accessToken;

  let body: Partial<CurateInput>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const input: CurateInput = {
    text: typeof body.text === "string" ? body.text.slice(0, 300) : "",
    tagIds: Array.isArray(body.tagIds) ? body.tagIds.filter((t) => typeof t === "string") : [],
    size: typeof body.size === "number" && Number.isFinite(body.size) ? body.size : undefined,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const emit = (event: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // client disconnected — stop pushing
        }
      };
      // Run the pipeline in the background so the Response returns immediately
      curate(accessToken, input, emit)
        .catch((err) => {
          emit({ stage: "error", message: err instanceof Error ? err.message : "Curation failed" });
        })
        .finally(() => {
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
      "X-Accel-Buffering": "no",
    },
  });
}
