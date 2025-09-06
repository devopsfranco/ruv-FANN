/**
 * Google Gemini adapter (practical REST-mode)
 *
 * This adapter supports two modes:
 * 1) GEMINI_REST_URL set to the full Vertex AI predict endpoint for the model:
 *    e.g. https://us-central1-aiplatform.googleapis.com/v1/projects/PROJECT/locations/LOCATION/models/MODEL:predict
 * 2) If GEMINI_REST_URL is not set, the adapter will fail with instructions.
 *
 * Authentication:
 * - Use GOOGLE_APPLICATION_CREDENTIALS (service account JSON) or other ADC.
 * - The adapter uses google-auth-library to fetch an access token for the IAM scope.
 *
 * Events and streaming:
 * - If stream=true, the adapter will simulate streaming by chunking the final text into small message events.
 * - If provider implements streaming via server-sent events or websocket, you can extend this adapter to forward tokens directly.
 *
 * Install helpers:
 * npm install google-auth-library node-fetch
 *
 * Env:
 * - GOOGLE_APPLICATION_CREDENTIALS (optional if ADC is present)
 * - GEMINI_REST_URL (required) -> full predict URL for the model
 * - GEMINI_MODEL (optional metadata)
 */

const {GoogleAuth} = require('google-auth-library');
const fetch = require('node-fetch');

function chunkString(str, size = 256) {
  const chunks = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size));
  }
  return chunks;
}

async function isAvailable() {
  // Basic check for REST URL and ability to fetch token
  if (!process.env.GEMINI_REST_URL) return false;
  try {
    const auth = new GoogleAuth();
    await auth.getClient(); // quick check that ADC exists or creds available
    return true;
  } catch (e) {
    // no ADC, but we still return false to indicate not ready
    return false;
  }
}

/**
 * invoke(params, onEvent)
 * - params.prompt (string)
 * - params.stream (bool) whether to emit streaming-like events
 * - params.model (optional)
 */
async function invoke(params = {}, onEvent = () => {}) {
  const prompt = String(params.prompt || '');
  const stream = !!params.stream;
  const modelInfo = params.model || process.env.GEMINI_MODEL || '<unknown>';

  onEvent({ type: 'thinking', data: { status: 'invoking', provider: 'google-gemini', model: modelInfo } });

  const url = process.env.GEMINI_REST_URL;
  if (!url) {
    const err = new Error('GEMINI_REST_URL must be set to the Vertex AI predict endpoint for your model.');
    onEvent({ type: 'error', data: { message: err.message } });
    throw err;
  }

  // Acquire OAuth2 access token for the proper scope
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  let token;
  try {
    const client = await auth.getClient();
    const res = await client.getAccessToken();
    token = res?.token || (typeof res === 'string' ? res : null);
    if (!token) {
      throw new Error('Failed to obtain access token via GoogleAuth.getClient().');
    }
  } catch (e) {
    onEvent({ type: 'error', data: { message: `Auth failed: ${e.message}` } });
    throw e;
  }

  // Build request body - Vertex AI shape may vary; this is a common pattern using "instances"
  // Adjust as needed for your model's expected payload.
  const body = {
    instances: [{ content: prompt }],
    // parameters: {} // optional model-specific parameters
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    onEvent({ type: 'error', data: { status: resp.status, body: text } });
    const err = new Error(`Gemini predict returned ${resp.status}: ${text}`);
    throw err;
  }

  const json = await resp.json();

  // Map response — Vertex responses vary. Common shapes:
  //  - { predictions: [ { content: "generated text" } ] } or
  //  - { predictions: [ { outputs: [ ... ] } ] }
  // Try a few heuristics; adapt per model.
  let finalText = '';
  try {
    if (Array.isArray(json.predictions) && json.predictions.length > 0) {
      const first = json.predictions[0];
      if (typeof first.content === 'string') finalText = first.content;
      else if (typeof first.text === 'string') finalText = first.text;
      else if (first.output && typeof first.output === 'string') finalText = first.output;
      else if (Array.isArray(first.outputs) && first.outputs.length > 0 && typeof first.outputs[0].content === 'string') {
        finalText = first.outputs[0].content;
      } else {
        finalText = JSON.stringify(first);
      }
    } else if (json[0] && typeof json[0].content === 'string') {
      finalText = json[0].content;
    } else {
      finalText = JSON.stringify(json);
    }
  } catch (e) {
    finalText = JSON.stringify(json);
  }

  // Emit events. If stream requested, chunk the text to simulate streaming tokens.
  if (stream) {
    const chunks = chunkString(finalText, 120);
    for (const chunk of chunks) {
      onEvent({ type: 'message', data: { role: 'assistant', text: chunk } });
      // await a tick so consumers can process (simulate real streaming)
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setImmediate(r));
    }
  } else {
    onEvent({ type: 'message', data: { role: 'assistant', text: finalText } });
  }

  return { success: true, provider: 'google-gemini', final: finalText, metrics: { providerRaw: json } };
}

module.exports = {
  isAvailable,
  invoke,
};
