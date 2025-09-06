/**
 * Roo Code adapter skeleton
 *
 * Expected environment:
 * - ROO_CODE_API_KEY (required)
 * - ROO_CODE_REST_URL (optional; default placeholder)
 *
 * Implement provider-specific auth, streaming and normalization here.
 *
 * Example: the adapter will POST { prompt } to ROO_CODE_REST_URL and expect { text } in response.
 */

const fetch = require('node-fetch');

async function isAvailable() {
  return !!process.env.ROO_CODE_API_KEY;
}

async function invoke(params = {}, onEvent = () => {}) {
  const prompt = String(params.prompt || '');
  const stream = !!params.stream;
  const url = process.env.ROO_CODE_REST_URL || 'https://api.roocode.example/v1/generate';
  const apiKey = process.env.ROO_CODE_API_KEY;

  if (!apiKey) {
    const err = new Error('ROO_CODE_API_KEY is not set.');
    onEvent({ type: 'error', data: { message: err.message } });
    throw err;
  }

  onEvent({ type: 'thinking', data: { status: 'invoking', provider: 'roo-code' } });

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
    throw new Error(`Roo Code API error ${resp.status}: ${text}`);
  }

  const json = await resp.json();
  const text = json.text || json.output || JSON.stringify(json);
  // naive streaming emulation
  if (stream) {
    for (let i = 0; i < text.length; i += 100) {
      onEvent({ type: 'message', data: { role: 'assistant', text: text.slice(i, i + 100) } });
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setImmediate(r));
    }
  } else {
    onEvent({ type: 'message', data: { role: 'assistant', text } });
  }

  return { success: true, provider: 'roo-code', final: text, metrics: { providerRaw: json } };
}

module.exports = {
  isAvailable,
  invoke,
};
