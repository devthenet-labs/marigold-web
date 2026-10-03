// Copyright 2026 DevTheNet Labs.
// SPDX-License-Identifier: MIT
'use strict';

// The API is a sibling service behind the same host: a preview routes /api to
// marigold-api, so the browser calls it same-origin, by a relative path. The
// web server never calls the API itself (preview pods cannot reach each other).
const GREETING_PATH = '/api/greeting';

async function loadGreeting(doc, fetchGreeting) {
  const greeting = doc.getElementById('greeting');
  const revision = doc.getElementById('api-revision');
  const servedAt = doc.getElementById('served-at');
  try {
    const response = await fetchGreeting(GREETING_PATH, {headers: {Accept: 'application/json'}, cache: 'no-store'});
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const body = await response.json();
    if (typeof body.message !== 'string') {
      throw new Error('malformed greeting');
    }
    // textContent only: the API's strings are never parsed as markup.
    greeting.textContent = body.message;
    revision.textContent = String(body.revision ?? '-');
    servedAt.textContent = String(body.servedAt ?? '-');
    greeting.dataset.state = 'ok';
  } catch {
    greeting.textContent = 'API unavailable';
    greeting.dataset.state = 'error';
  }
}

async function initNameForm(doc, fetchGreeting) {
  const form = doc.getElementById('name-form');
  const input = doc.getElementById('name-input');
  const greeting = doc.getElementById('greeting');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value;
    const url = name === '' ? GREETING_PATH : `${GREETING_PATH}?name=${encodeURIComponent(name)}`;
    try {
      const response = await fetchGreeting(url, {headers: {Accept: 'application/json'}, cache: 'no-store'});
      const body = await response.json();
      if (!response.ok) {
        greeting.textContent = typeof body.error === 'string' ? body.error : `HTTP ${response.status}`;
        greeting.dataset.state = 'error';
        return;
      }
      if (typeof body.message !== 'string') {
        throw new Error('malformed greeting');
      }
      // textContent only: the API's strings are never parsed as markup.
      greeting.textContent = body.message;
      greeting.dataset.state = 'ok';
    } catch {
      greeting.textContent = 'API unavailable';
      greeting.dataset.state = 'error';
    }
  });
}

if (typeof module === 'object' && module.exports) {
  module.exports = {loadGreeting, initNameForm, GREETING_PATH};
} else {
  document.addEventListener('DOMContentLoaded', () => {
    loadGreeting(document, window.fetch.bind(window));
    initNameForm(document, window.fetch.bind(window));
  });
}
