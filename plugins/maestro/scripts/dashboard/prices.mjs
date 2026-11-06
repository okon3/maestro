// List prices in USD per million tokens (contract: docs/dashboard-contract.md, Prices).
// Source: Anthropic pricing page, checked 2026-11-06. `cacheWrite` is the 5-minute cache write price
// (1.25x input); the 1-hour write price is not used. Haiku 5.5 uses the tier for prompts up to 100,000 tokens.
// Models not listed here are reported as `unpriced` by the dashboard (usd null). `.maestro/config.json`
// key `prices` overrides these entries (same shape, keyed by model id or family name).
export const PRICES_SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing";
export const PRICES_AS_OF = "2026-11-06";

const entry = (input, output, cacheRead, cacheWrite) => ({
  input,
  output,
  cacheRead,
  cacheWrite,
  source: PRICES_SOURCE,
  asOf: PRICES_AS_OF,
});

export const PRICES = Object.freeze({
  "claude-opus-5-5": entry(4, 20, 0.2, 5),
  "claude-sonnet-5-5": entry(2, 10, 0.1, 2.5),
  "claude-haiku-5-5": entry(0.1, 0.5, 0.01, 0.125),
});

const FAMILIES = ["opus", "sonnet", "haiku"];
const familyOf = (model) => FAMILIES.find((f) => String(model).toLowerCase().includes(f)) ?? null;
const valid = (p) => p && ["input", "output", "cacheRead", "cacheWrite"].every((k) => typeof p[k] === "number");

/**
 * Price entry for a model id, or null. Lookup order: exact id in overrides, exact id in defaults,
 * then the family (opus/sonnet/haiku) by substring in overrides, then in defaults.
 */
export function priceFor(model, overrides = {}) {
  for (const table of [overrides ?? {}, PRICES]) {
    if (valid(table[model])) return table[model];
  }
  const family = familyOf(model);
  if (!family) return null;
  for (const table of [overrides ?? {}, PRICES]) {
    const key = Object.keys(table).find((k) => k.toLowerCase().includes(family) && valid(table[k]));
    if (key) return table[key];
  }
  return null;
}

/** USD for token counts {input, output, cacheRead, cacheWrite}, unrounded; null when the model has no price. */
export function costUsd(model, tokens, overrides) {
  const p = priceFor(model, overrides);
  if (!p) return null;
  return (
    ((tokens.input ?? 0) * p.input +
      (tokens.output ?? 0) * p.output +
      (tokens.cacheRead ?? 0) * p.cacheRead +
      (tokens.cacheWrite ?? 0) * p.cacheWrite) /
    1e6
  );
}
