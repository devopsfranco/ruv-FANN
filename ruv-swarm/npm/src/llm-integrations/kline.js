/**
 * Kline adapter skeleton
 *
 * Expected environment:
 * - KLINE_API_KEY
 * - KLINE_REST_URL (optional)
 *
 * Implement actual endpoints and auth based on Kline's public API.
 */

const fetch = require('node-fetch');

async function isAvailable() {
  return !!process.env.KLINE_API_KEY;
}

async function invoke(params = {}, onEvent = () => {}) {
  const prompt = String(params.prompt || '');
  const stream = !!params.stream;
  const url = process.env.KLINE_REST_URL || 'https://api.kline.example/v1/generate';
  const apiKey = process.env.KLINE_API_KEY;

  if (!apiKey) {
    const err = new Error('KLINE_API_KEY is not set.');
    onEvent({ type: 'error', data: { message: err.message } });
    throw err;
  }

  onEvent({ type: 'thinking', data: { status: 'invoking', provider: 'kline' } });

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    onEvent({ type: 'error', data: { status: resp.status, body: text } });
    throw new Error(`Kline API error ${resp.status}: ${text}`);
  }

  const json = await resp.json();
  const text = json.text || json.output || JSON.stringify(json);

  if (stream) {
    for (let i = 0; i < text.length; i += 100) {
      onEvent({ type: 'message', data: { role: 'assistant', text: text.slice(i, i + 100) } });
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setImmediate(r));
    }
  } else {
    onEvent({ type: 'message', data: { role: 'assistant', text } });
  }

  return { success: true, provider: 'kline', final: text, metrics: { providerRaw: json } };
}

module.exports = {
  isAvailable,
  invoke,
};
