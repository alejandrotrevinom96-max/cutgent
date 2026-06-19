# Cutgent skills

Claude Agent Skills that teach an AI client to drive Cutgent in natural language
over its MCP server (no need to know which tool to call).

## `editing-video-with-cutgent`

End-to-end video editing: assemble, cut silences, captions/subtitles, color,
audio cleanup, vertical shorts, AI b-roll, and export/render. Triggers on phrases
like "edit this video", "ponle subtítulos", "haz un short vertical", "export to
Premiere" — even when no tool is named.

### Prerequisite
The **`cutgent` MCP server must be connected** in your AI client (it ships with
Cutgent; see the in-app onboarding "Copiar configuración para conectar mi IA").
The skill assumes the tools are exposed as `mcp__cutgent__<tool>`. Keep Cutgent
open while editing — the AI controls the running window. Local file ingest and the
ffmpeg ops (transcribe / clean_audio / apply_lut / chroma_key / stabilize) are
**desktop (Electron) only**.

### Install

**Claude Code — all your projects**
```bash
cp -r skills/editing-video-with-cutgent ~/.claude/skills/
# Windows PowerShell:
# Copy-Item -Recurse skills\editing-video-with-cutgent $HOME\.claude\skills\
```

**Claude Code — just this repo**
```bash
mkdir -p .claude/skills && cp -r skills/editing-video-with-cutgent .claude/skills/
```
Accept the workspace trust dialog (the skill pre-approves a few read-only
`mcp__cutgent__*` tools via `allowed-tools`).

**Claude Desktop / claude.ai** (Pro/Max/Team/Enterprise, code execution on)
Zip the folder and upload it in **Settings → Features → Skills**:
```bash
cd skills && zip -r editing-video-with-cutgent.zip editing-video-with-cutgent
```
The `.zip` does NOT configure the MCP — connect `cutgent` separately in Desktop's
MCP config.

### Use
Ask naturally: "edita este video de YouTube", "córtale los silencios y ponle
subtítulos", "haz un short vertical del minuto 3 al 4", "expórtalo a Premiere".
In Claude Code you can also run `/editing-video-with-cutgent`.

> Skills do not sync across surfaces — install on each one you use. If Cutgent is
> later bundled as a Claude Code plugin, tool ids become
> `mcp__<plugin>_cutgent__<tool>`; update them only in
> `editing-video-with-cutgent/references/tools-map.md`.
