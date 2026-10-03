// Copyright 2026 DevTheNet Labs.
// SPDX-License-Identifier: MIT
'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {loadGreeting, GREETING_PATH} = require('../static/app.js');

function page() {
  const elements = {};
  for (const id of ['greeting', 'api-revision', 'served-at']) {
    elements[id] = {textContent: '', dataset: {}};
  }
  return {elements, getElementById: id => elements[id]};
}

function respond(status, body) {
  const calls = [];
  const fetchGreeting = async (url, options) => {
    calls.push({url, options});
    return {ok: status >= 200 && status < 300, status, json: async () => body};
  };
  return {calls, fetchGreeting};
}

test('renders the greeting from the same-origin API', async () => {
  const doc = page();
  const api = respond(200, {message: 'Hello from Marigold', revision: 'abc123', servedAt: '2026-10-03T12:00:00Z'});
  await loadGreeting(doc, api.fetchGreeting);
  assert.equal(GREETING_PATH, '/api/greeting');
  assert.deepEqual(api.calls.map(c => c.url), ['/api/greeting']);
  assert.equal(doc.elements.greeting.textContent, 'Hello from Marigold');
  assert.equal(doc.elements['api-revision'].textContent, 'abc123');
  assert.equal(doc.elements['served-at'].textContent, '2026-10-03T12:00:00Z');
  assert.equal(doc.elements.greeting.dataset.state, 'ok');
});

test('markup in the greeting stays text', async () => {
  const doc = page();
  await loadGreeting(doc, respond(200, {message: '<img src=x onerror=alert(1)>'}).fetchGreeting);
  assert.equal(doc.elements.greeting.textContent, '<img src=x onerror=alert(1)>');
  assert.equal(doc.elements['api-revision'].textContent, '-');
});

for (const [name, fetchGreeting] of Object.entries({
  'an HTTP error': respond(502, {message: 'gateway'}).fetchGreeting,
  'a 404 from a missing API route': respond(404, {error: 'not found'}).fetchGreeting,
  'a malformed body': respond(200, {greeting: 'wrong key'}).fetchGreeting,
  'a network failure': async () => { throw new TypeError('Failed to fetch'); },
  'a body that is not JSON': async () => ({ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); }}),
})) {
  test(`shows "API unavailable" on ${name}`, async () => {
    const doc = page();
    await loadGreeting(doc, fetchGreeting);
    assert.equal(doc.elements.greeting.textContent, 'API unavailable');
    assert.equal(doc.elements.greeting.dataset.state, 'error');
  });
}
