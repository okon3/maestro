// Synthetic transcript builders for the context and hook tests.
import { mkdtempSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function assistant(id, usage, extra = {}) {
  return {
    type: "assistant",
    timestamp: extra.timestamp ?? "2026-11-06T10:00:00.000Z",
    isSidechain: extra.isSidechain ?? false,
    message: {
      id,
      model: extra.model ?? "claude-sonnet-5-5",
      usage: {
        input_tokens: usage.input ?? 0,
        output_tokens: usage.output ?? 0,
        cache_read_input_tokens: usage.cacheRead ?? 0,
        cache_creation_input_tokens: usage.cacheWrite ?? 0,
      },
    },
  };
}

export function writeTranscript(lines, name = "t.jsonl") {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "maestro-ctx-")));
  const file = join(dir, name);
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return file;
}
