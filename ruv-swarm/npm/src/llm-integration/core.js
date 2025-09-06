/**
 * Provider-agnostic LLM integration core (CommonJS)
 *
 * Responsibilities:
 * - load a provider adapter from ./llm-integrations/<provider>.js
 * - expose isProviderAvailable(providerName) and invokeProvider(providerName, params, onEvent)
 *
 * Behavior change: If no providerName is passed, the core will prefer the provider set in
 * environment variable LLM_DEFAULT_PROVIDER. If that is not set, it defaults to 'google-gemini' per your request.
 *
 * Usage:
 * const llm = require('./llm-integration/core');
 * await llm.invokeProvider('google-gemini', { prompt, stream: true }, (evt) => console.log(evt));
 */

const path = require('path');

function adapterPath(providerName) {
  return path.join(__dirname, 'llm-integrations', `${providerName}.js`);
}

function loadAdapter(providerName) {
  try {
    // require at runtime so adapters can be optional deps
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const adapter = require(adapterPath(providerName));
    return adapter;
  } catch (err) {
    const e = new Error(`LLM adapter not found for provider \