// Copyright 2026 DevTheNet Labs.
// SPDX-License-Identifier: MIT
'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {loadGreeting, initNameForm, GREETING_PATH} = require('../static/app.js');

function page() {
  const elements = {};
  for (const id of ['greeting', 'api-revision', 'served-at']) {
    elements[id] = {textContent: '', dataset: {}};
  }
  const listeners = {};
  elements['name-form'] = {addEventListener: (type, handler) => { listeners[type] = handler; }};
  elements['name-input'] = {value: ''};
  return {elements, listeners, getElementById: id => elements[id]};
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

test('submitting a valid name calls the API with the name query parameter', async () => {
  const doc = page();
  const api = respond(200, {message: 'Hello, Ada!', revision: 'abc123', servedAt: '2026-10-03T12:00:00Z'});
  await initNameForm(doc, api.fetchGreeting);
  doc.elements['name-input'].value = 'Ada';
  await doc.listeners.submit({preventDefault() {}});
  assert.deepEqual(api.calls.map(c => c.url), ['/api/greeting?name=Ada']);
  assert.equal(doc.elements.greeting.textContent, 'Hello, Ada!');
  assert.equal(doc.elements.greeting.dataset.state, 'ok');
});

test('submitting a name with special characters URL-encodes it', async () => {
  const doc = page();
  const name = "O'Brien Jr.";
  const api = respond(200, {message: `Hello, ${name}!`});
  await initNameForm(doc, api.fetchGreeting);
  doc.elements['name-input'].value = name;
  await doc.listeners.submit({preventDefault() {}});
  assert.deepEqual(api.calls.map(c => c.url), [`/api/greeting?name=${encodeURIComponent(name)}`]);
  assert.equal(doc.elements.greeting.textContent, `Hello, ${name}!`);
  assert.equal(doc.elements.greeting.dataset.state, 'ok');
});

test('submitting an empty name calls the API without a name parameter', async () => {
  const doc = page();
  const api = respond(200, {message: 'Hello from Marigold'});
  await initNameForm(doc, api.fetchGreeting);
  doc.elements['name-input'].value = '';
  await doc.listeners.submit({preventDefault() {}});
  assert.deepEqual(api.calls.map(c => c.url), ['/api/greeting']);
  assert.equal(doc.elements.greeting.textContent, 'Hello from Marigold');
  assert.equal(doc.elements.greeting.dataset.state, 'ok');
});

test('a 400 response from the API shows its error message', async () => {
  const doc = page();
  const api = respond(400, {error: 'name must be 1-40 letters, spaces, hyphens or apostrophes'});
  await initNameForm(doc, api.fetchGreeting);
  doc.elements['name-input'].value = '<script>';
  await doc.listeners.submit({preventDefault() {}});
  assert.equal(doc.elements.greeting.textContent, 'name must be 1-40 letters, spaces, hyphens or apostrophes');
  assert.equal(doc.elements.greeting.dataset.state, 'error');
});
