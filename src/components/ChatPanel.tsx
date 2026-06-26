"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, X, Sparkles, Wrench, Check, AlertTriangle } from "lucide-react";

/**
 * Panel de IA EMBEBIDO — la vía de 0 fricción para "editar conversando".
 * El usuario pega su API key de Claude UNA vez (se guarda server-side) y habla.
 * El loop tool-use corre en /api/agent/chat; el documento se refresca en vivo por
 * el SSE existente del editor (este panel NO aplica comandos). Sin MCP, sin
 * config de cliente externo, sin reinicio.
 */

type ToolCall = { name: string; ok?: boolean; message?: string };
type ChatMsg = { role: "user" | "assistant"; text: string; tools?: ToolCall[] };

const MODELS = [
  { id: "claude-opus-4-8", label: "Opus 4.8 (máx. capacidad)" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 (rápido)" },
];

export function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [keyReady, setKeyReady] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState(MODELS[0].id);
  const scrollRef = useRef<HTMLDivElement>(null);

  const checkKey = () =>
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => setKeyReady(!!s?.keys?.ANTHROPIC_API_KEY?.set))
      .catch(() => setKeyReady(false));

  useEffect(() => {
    if (open && keyReady === null) void checkKey();
  }, [open, keyReady]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const saveKey = async () => {
    const v = keyInput.trim();
    if (!v) return;
    setSavingKey(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: { ANTHROPIC_API_KEY: v } }),
      });
      setKeyInput("");
      await checkKey();
    } finally {
      setSavingKey(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    // Historial para la API: los mensajes previos como texto + el nuevo.
    const apiMessages = [
      ...messages.filter((m) => m.text).map((m) => ({ role: m.role, content: m.text })),
      { role: "user" as const, content: text },
    ];
    setMessages((prev) => [...prev, { role: "user", text }, { role: "assistant", text: "", tools: [] }]);
    setBusy(true);

    const patchLast = (fn: (m: ChatMsg) => ChatMsg) =>
      setMessages((prev) => {
        const next = prev.slice();
        next[next.length - 1] = fn(next[next.length - 1]);
        return next;
      });

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, model }),
      });
      if (res.status === 401) {
        setKeyReady(false);
        patchLast((m) => ({ ...m, text: "Falta tu API key de Claude (o es inválida). Pégala arriba." }));
        return;
      }
      if (!res.body) {
        patchLast((m) => ({ ...m, text: "No hubo respuesta del servidor." }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          let evt: Record<string, unknown>;
          try {
            evt = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
          if (evt.type === "text") {
            patchLast((m) => ({ ...m, text: m.text + String(evt.text ?? "") }));
          } else if (evt.type === "tool_use") {
            patchLast((m) => ({ ...m, tools: [...(m.tools ?? []), { name: String(evt.name) }] }));
          } else if (evt.type === "tool_result") {
            patchLast((m) => {
              const tools = (m.tools ?? []).slice();
              // marca el último tool pendiente con ese nombre
              for (let i = tools.length - 1; i >= 0; i--) {
                if (tools[i].name === evt.name && tools[i].ok === undefined) {
                  tools[i] = { ...tools[i], ok: !!evt.ok, message: String(evt.message ?? "") };
                  break;
                }
              }
              return { ...m, tools };
            });
          } else if (evt.type === "error") {
            if (evt.code === "bad-key") setKeyReady(false);
            patchLast((m) => ({ ...m, text: m.text + `\n\n⚠️ ${String(evt.message ?? "Error")}` }));
          }
        }
      }
    } catch (e) {
      patchLast((m) => ({ ...m, text: m.text + `\n\n⚠️ ${e instanceof Error ? e.message : String(e)}` }));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Asistente de IA"
        className="fixed bottom-5 right-5 z-[1000] flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-lg hover:bg-accent-2"
      >
        <Sparkles size={20} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 top-0 z-[1000] flex w-[380px] max-w-[92vw] flex-col border-l border-border bg-panel shadow-2xl">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Bot size={18} className="text-accent" />
        <span className="flex-1 text-sm font-semibold text-text">Asistente de IA</span>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="rounded border border-border bg-panel-2 px-1.5 py-1 text-[10px] text-muted outline-none"
          title="Modelo"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-text">
          <X size={18} />
        </button>
      </div>

      {keyReady === false ? (
        <div className="flex flex-1 flex-col justify-center gap-3 p-5">
          <Sparkles size={22} className="text-accent" />
          <p className="text-sm font-medium text-text">Conecta tu Claude — una sola vez</p>
          <p className="text-xs leading-relaxed text-muted">
            Pega tu API key de Anthropic. Se guarda solo en tu equipo y nunca sale de tu máquina salvo para hablar con Claude. Sin MCP, sin reinicio.
          </p>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void saveKey(); }}
            placeholder="sk-ant-…"
            className="w-full rounded-md border border-border bg-panel-2 px-2.5 py-2 text-sm text-text outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={saveKey}
            disabled={savingKey || !keyInput.trim()}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-2 disabled:opacity-40"
          >
            {savingKey ? "Guardando…" : "Conectar"}
          </button>
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-accent underline-offset-2 hover:underline"
          >
            Obtener una API key ↗
          </a>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="mt-6 text-center text-xs leading-relaxed text-muted">
                <Sparkles size={20} className="mx-auto mb-2 text-accent" />
                Pídeme que edite tu video. Ej.:
                <div className="mt-2 space-y-1 text-[11px]">
                  <p>«Añade un título “Hola” centrado los primeros 3 segundos»</p>
                  <p>«Pon un fondo negro al inicio y baja la duración a 10s»</p>
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-lg bg-accent px-3 py-2 text-sm text-white"
                      : "max-w-[92%] rounded-lg bg-panel-2 px-3 py-2 text-sm text-text"
                  }
                >
                  {m.text && <div className="whitespace-pre-wrap break-words">{m.text}</div>}
                  {(m.tools ?? []).map((t, j) => (
                    <div key={j} className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
                      {t.ok === undefined ? (
                        <Wrench size={12} className="animate-pulse text-[var(--info)]" />
                      ) : t.ok ? (
                        <Check size={12} className="text-[var(--ok)]" />
                      ) : (
                        <AlertTriangle size={12} className="text-[var(--danger,#e5484d)]" />
                      )}
                      <span className="font-mono">{t.name}</span>
                      {t.ok === false && t.message && <span className="truncate">· {t.message}</span>}
                    </div>
                  ))}
                  {m.role === "assistant" && !m.text && (m.tools?.length ?? 0) === 0 && busy && (
                    <span className="text-xs text-muted">Pensando…</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={2}
                placeholder="Pídele un cambio a tu video…"
                className="max-h-32 flex-1 resize-none rounded-md border border-border bg-panel-2 px-2.5 py-2 text-sm text-text outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={send}
                disabled={busy || !input.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-white hover:bg-accent-2 disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
