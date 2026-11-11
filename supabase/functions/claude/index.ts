// "Minta analisa Claude" and "Cari titik dengan Claude" for the Audy Expansion page.
// Needs the Supabase secret ANTHROPIC_API_KEY. Without it the page hides the Claude buttons.
// Request:  { ping: true }            -> { ok: boolean }
//           { input: string | {role, content}[] } -> { text } or { error, code }
import Anthropic from "npm:@anthropic-ai/sdk@1.5.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  let body: { ping?: boolean; input?: unknown };
  try { body = await req.json(); } catch { return json({ error: "invalid body", code: "invalid_argument" }, 400); }
  if (body.ping) return json({ ok: Boolean(key) });
  if (!key) return json({ error: "ANTHROPIC_API_KEY belum diisi di Supabase secrets", code: "not_granted" });

  const messages: Anthropic.Beta.BetaMessageParam[] = typeof body.input === "string"
    ? [{ role: "user", content: body.input }]
    : (Array.isArray(body.input) ? (body.input as Anthropic.Beta.BetaMessageParam[]) : []);
  if (!messages.length) return json({ error: "input kosong", code: "invalid_argument" }, 400);

  const client = new Anthropic({ apiKey: key });
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "medium" },
      // if a safety classifier declines, the API retries on a fallback model inside the same call
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages,
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);
    if (response.stop_reason === "refusal") return json({ error: "Claude menolak permintaan ini.", code: "refused" });
    const text = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("");
    return json({ text });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "Terlalu banyak permintaan ke Claude", code: "rate_limited" });
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "ANTHROPIC_API_KEY tidak valid", code: "not_granted" });
    if (e instanceof Anthropic.APIError) return json({ error: `Claude API ${e.status}: ${e.message}`, code: "unavailable" });
    return json({ error: String((e as Error).message || e), code: "unavailable" });
  }
});
