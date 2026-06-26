import { NextRequest } from "next/server";
import { getKey } from "@/lib/settings-store";
import { getDocument, dispatch } from "@/lib/server-store";
import { AGENT_TOOLS, AGENT_TOOLS_BY_NAME, AGENT_CLIENT_ID } from "@/lib/agent/tools";
import {
  callClaude,
  resolveModel,
  AnthropicError,
  type AnthropicMessage,
  type AnthropicTool,
  type ContentBlock,
} from "@/lib/agent/anthropic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/agent/chat  { messages: AnthropicMessage[], model? }
 * Corre el loop tool-use de Claude SERVER-SIDE con la key BYO del usuario y aplica
 * las herramientas contra el command-bus (dispatch). Devuelve un stream SSE de
 * eventos {type:"text"|"tool_use"|"tool_result"|"done"|"error"}. El documento se
 * refresca en el editor por el SSE existente — aquí no se reenvía el doc.
 */

const MAX_ITERATIONS = 12; // turnos modelo↔herramientas por mensaje del usuario
const MAX_TOOLS = 50; // tope duro de tool-calls por turno (coste/loops)

const SYSTEM = `Eres el asistente de edición DENTRO de Cutgent, un editor de video. Editas el proyecto del usuario llamando herramientas.

Reglas del modelo de datos:
- Tiempos en FRAMES. Segundos = frames / fps del proyecto.
- x/y = offset en píxeles desde el CENTRO del lienzo (0,0 = centrado).
- Las capas: el primer track se dibuja abajo; el último, encima.

Cómo trabajar:
- Llama get_project al inicio (o cuando dudes) para conocer ids reales, fps y dimensiones ANTES de editar. Nunca inventes ids.
- Para video/imagen/audio necesitas un src ya disponible (un asset importado por el usuario). Si no lo hay, dilo; no inventes URLs.
- Haz los cambios con las herramientas y luego confirma en 1-2 frases lo que hiciste. Sé conciso y directo; actúa en vez de preguntar cuando la intención es clara.`;

const toAnthropicTool = (t: (typeof AGENT_TOOLS)[number]): AnthropicTool => ({
  name: t.name,
  description: t.description,
  input_schema: t.input_schema,
});

async function execTool(name: string, input: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
  const tool = AGENT_TOOLS_BY_NAME[name];
  if (!tool) return { ok: false, message: `Herramienta desconocida: ${name}` };
  try {
    const doc = await getDocument(); // fresco: cada tool ve las mutaciones previas
    const { commands, message } = tool.plan(input ?? {}, doc);
    for (const c of commands) await dispatch(c, AGENT_CLIENT_ID);
    return { ok: true, message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function POST(req: NextRequest) {
  const apiKey = await getKey("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "no-key" }), { status: 401, headers: { "content-type": "application/json" } });
  }

  let body: { messages?: AnthropicMessage[]; model?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad-json" }), { status: 400, headers: { "content-type": "application/json" } });
  }
  const messages: AnthropicMessage[] = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: "empty" }), { status: 400, headers: { "content-type": "application/json" } });
  }
  const model = resolveModel(body.model);
  const tools = AGENT_TOOLS.map(toAnthropicTool);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (evt: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
        } catch {
          /* cliente desconectado */
        }
      };

      const convo: AnthropicMessage[] = [...messages];
      let toolBudget = MAX_TOOLS;
      try {
        for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
          const resp = await callClaude({ apiKey, model, system: SYSTEM, tools, messages: convo, signal: req.signal });

          // Emitir texto de esta iteración en orden.
          for (const block of resp.content) {
            if (block.type === "text" && block.text) send({ type: "text", text: block.text });
          }

          const toolUses = resp.content.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");
          if (toolUses.length === 0) {
            send({ type: "done", stop: resp.stop_reason });
            controller.close();
            return;
          }

          // Ejecutar cada tool y construir los tool_result para la siguiente vuelta.
          const results: ContentBlock[] = [];
          for (const tu of toolUses) {
            if (toolBudget-- <= 0) {
              results.push({ type: "tool_result", tool_use_id: tu.id, content: "Tope de herramientas alcanzado en este turno.", is_error: true });
              continue;
            }
            send({ type: "tool_use", name: tu.name, input: tu.input });
            const r = await execTool(tu.name, tu.input);
            send({ type: "tool_result", name: tu.name, ok: r.ok, message: r.message });
            results.push({ type: "tool_result", tool_use_id: tu.id, content: r.message, is_error: !r.ok });
          }

          // Anexa el turno del asistente + los resultados, y vuelve a iterar.
          convo.push({ role: "assistant", content: resp.content });
          convo.push({ role: "user", content: results });
        }
        send({ type: "text", text: "\n\n_(Alcancé el límite de pasos por turno. Pídeme que continúe si falta algo.)_" });
        send({ type: "done", stop: "max_iterations" });
        controller.close();
      } catch (e) {
        const code = e instanceof AnthropicError && e.status === 401 ? "bad-key" : "error";
        send({ type: "error", code, message: e instanceof Error ? e.message : String(e) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
