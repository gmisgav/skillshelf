// SkillShelf "Try this skill" chat: a thin, rate-limited proxy that runs a visitor's
// messages against one published skill and streams the reply back as SSE.
import Anthropic from '@anthropic-ai/sdk';

const MAX_TURNS = 12;
const MAX_CHARS = 4000;

const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json' } });

function corsHeaders(env, origin) {
  const allowed = env.ALLOWED_ORIGINS.split(',').map(s => s.trim());
  return allowed.includes(origin)
    ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'origin' }
    : null;
}

// Skills come from our own published site (cached at the edge), so a caller can't
// turn this endpoint into a general-purpose proxy with an arbitrary system prompt.
async function loadSkill(env, slug) {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return null;
  const res = await fetch(`${env.SITE_URL}/data/skill/${slug}.json`, { cf: { cacheTtl: 3600, cacheEverything: true } });
  return res.ok ? res.json() : null;
}

function systemPrompt(skill) {
  return [
    {
      type: 'text',
      text: `You are demonstrating the AI agent skill "${skill.name}" on SkillShelf, a public skills library. A visitor is trying it out before installing it.

Follow the skill's instructions below as if it were installed. Answer in the visitor's language. Keep replies focused and reasonably short, since this is a preview. You cannot run the skill's scripts, read files, or browse here: when a step needs them, say what would happen in the full install and continue with what you can do. Never claim to have filed, submitted, ordered, paid for or sent anything. For tax, legal, medical or financial questions, give general information and suggest confirming with a licensed professional.

<skill name="${skill.name}">
${skill.body}
</skill>`,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

function cleanMessages(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_TURNS) return null;
  const out = [];
  for (const m of raw) {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string') return null;
    const content = m.content.trim().slice(0, MAX_CHARS);
    if (!content) return null;
    out.push({ role: m.role, content });
  }
  return out[0].role === 'user' && out.at(-1).role === 'user' ? out : null;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    const cors = corsHeaders(env, origin);
    if (!cors) return new Response('Forbidden', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

    const ip = request.headers.get('cf-connecting-ip') || 'anon';
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) return json({ error: 'You are sending messages too quickly. Wait a minute and try again.' }, 429, cors);

    let payload;
    try { payload = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400, cors); }
    const messages = cleanMessages(payload.messages);
    if (!messages) return json({ error: 'Invalid conversation' }, 400, cors);
    const skill = await loadSkill(env, String(payload.slug || ''));
    if (!skill) return json({ error: 'Unknown skill' }, 404, cors);

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
    const send = obj => writer.write(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

    (async () => {
      try {
        const stream = client.beta.messages.stream({
          model: env.MODEL,
          max_tokens: Number(env.MAX_OUTPUT_TOKENS),
          output_config: { effort: 'low' }, // chat preview: fast, inexpensive answers
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default', // re-run a safety decline on Anthropic's recommended fallback model
          system: systemPrompt(skill),
          messages,
        });
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') await send({ t: event.delta.text });
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === 'refusal') await send({ error: "This request can't be answered here. Try rephrasing it." });
        else if (final.stop_reason === 'max_tokens') await send({ t: '\n\n…(preview cut short; install the skill for the full answer)' });
        await send({ done: true });
      } catch (err) {
        const status = err instanceof Anthropic.APIError ? err.status : 0;
        const message = status === 429 || status === 529
          ? 'The demo is busy right now. Try again in a moment.'
          : 'Something went wrong running this skill. Try again.';
        console.error('chat error', status, err?.message);
        await send({ error: message });
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, { headers: { ...cors, 'content-type': 'text/event-stream', 'cache-control': 'no-store' } });
  },
};
