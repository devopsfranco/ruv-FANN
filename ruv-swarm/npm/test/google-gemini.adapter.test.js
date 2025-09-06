/**
 * Jest unit test that verifies the google-gemini adapter can be invoked and emits events.
 * This test mocks node-fetch so you don't need real credentials.
 *
 * Run:
 * cd ruv-swarm/npm
 * npm install --save-dev jest node-fetch@2
 * npx jest test/google-gemini.adapter.test.js
 *
 * Note: If your repo already uses a different test runner, adapt accordingly.
 */

const path = require('path');

jest.mock('node-fetch', () => jest.fn());
const fetch = require('node-fetch');

const { invoke } = require('../src/llm-integrations/google-gemini');

describe('google-gemini adapter (mocked)', () => {
  const origEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...origEnv };
    // set a fake URL so the adapter proceeds to call fetch
    process.env.GEMINI_REST_URL = 'https://mocked.example/v1/predict';
    // ensure token acquisition is not required by faking GoogleAuth methods
    // Mock GoogleAuth client
    jest.mock('google-auth-library', () => {
      return {
        GoogleAuth: jest.fn().mockImplementation(() => ({
          getClient: async () => ({
            getAccessToken: async () => ({ token: 'MOCK_TOKEN' }),
          }),
        })),
      };
    });
  });

  afterEach(() => {
    process.env = origEnv;
    jest.unmock('google-auth-library');
  });

  it('invokes and emits message events (mocked fetch)', async () => {
    // Mock fetch response shape
    const mockJson = { predictions: [{ content: 'Hello from mocked Gemini' }] };
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockJson,
    });

    const events = [];
    const result = await invoke({ prompt: 'hi', stream: false }, (evt) => events.push(evt));

    expect(result.success).toBe(true);
    expect(result.provider).toBe('google-gemini');
    expect(events.some((e) => e.type === 'message')).toBe(true);
    const message = events.find((e) => e.type === 'message');
    expect(message.data.text).toContain('Hello from mocked Gemini');
  }, 10000);
});
