// STT provider (renderer). Default: the browser SpeechRecognition API for a
// zero-install demo. For real privacy/quality, swap in local faster-whisper/
// whisper.cpp behind this same interface (ADR D6) — LOCAL-ONLY + EPHEMERAL by
// policy; nothing here persists audio.
export interface SttEvent { kind: "partial" | "final"; speaker: string; text: string; turnId: string; }
export interface SttProvider {
  start(onEvent: (e: SttEvent) => void): void;
  stop(): void;
  available(): boolean;
}

export class BrowserStt implements SttProvider {
  private rec: any = null;
  private turnId = "";

  available(): boolean {
    return typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }

  start(onEvent: (e: SttEvent) => void): void {
    const Rec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Rec) return;
    this.rec = new Rec();
    this.rec.continuous = true;
    this.rec.interimResults = true;
    this.rec.lang = navigator.language || "en-US";
    this.turnId = "t" + Date.now();
    this.rec.onresult = (ev: any) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        onEvent({
          kind: res.isFinal ? "final" : "partial",
          speaker: "me",
          text: res[0].transcript.trim(),
          turnId: this.turnId,
        });
      }
    };
    this.rec.start();
  }

  stop(): void {
    try { this.rec?.stop(); } catch { /* noop */ }
    this.rec = null;
  }
}
