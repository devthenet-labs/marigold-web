// Copyright 2026 DevTheNet Labs.
// SPDX-License-Identifier: MIT

package main

import (
	"encoding/json"
	"io"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
)

func serve(h http.Handler, method, path string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(method, path, nil))
	return w
}

func TestRoutes(t *testing.T) {
	h := newHandler("0123456789abcdef")
	for _, tc := range []struct {
		method, path, contentType, contains string
		status                              int
	}{
		{http.MethodGet, "/", "text/html; charset=utf-8", `id="greeting"`, http.StatusOK},
		{http.MethodGet, "/static/app.js", "text/javascript; charset=utf-8", "loadGreeting", http.StatusOK},
		{http.MethodGet, "/static/style.css", "text/css; charset=utf-8", ".card", http.StatusOK},
		{http.MethodGet, "/healthz", "application/json", `"status":"ok"`, http.StatusOK},
		{http.MethodGet, "/static/", "text/plain; charset=utf-8", "404", http.StatusNotFound},
		{http.MethodGet, "/static/missing.js", "text/plain; charset=utf-8", "404", http.StatusNotFound},
		{http.MethodGet, "/missing", "text/plain; charset=utf-8", "404", http.StatusNotFound},
		{http.MethodPost, "/", "text/plain; charset=utf-8", "Method Not Allowed", http.StatusMethodNotAllowed},
	} {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			w := serve(h, tc.method, tc.path)
			if w.Code != tc.status || w.Header().Get("Content-Type") != tc.contentType || !strings.Contains(w.Body.String(), tc.contains) {
				t.Fatalf("status=%d type=%q body=%q", w.Code, w.Header().Get("Content-Type"), w.Body.String())
			}
			if w.Header().Get("X-Content-Type-Options") != "nosniff" || w.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("missing security headers")
			}
			if w.Header().Get("Set-Cookie") != "" {
				t.Fatal("the web app must not set cookies")
			}
		})
	}
}

// The web app serves nothing under /api: in a preview that prefix belongs to
// marigold-api, and the load balancer never sends it here.
func TestNoAPIRoutes(t *testing.T) {
	h := newHandler("test")
	for _, path := range []string{"/api", "/api/", "/api/greeting", "/api/anything/else"} {
		if w := serve(h, http.MethodGet, path); w.Code != http.StatusNotFound {
			t.Errorf("GET %s: status=%d, want 404", path, w.Code)
		}
	}
}

func TestIndexLoadsTheScriptAndHasAGreetingSlot(t *testing.T) {
	body := serve(newHandler("test"), http.MethodGet, "/").Body.String()
	for _, want := range []string{`id="greeting"`, `<script src="/static/app.js" defer></script>`, `href="/static/style.css"`} {
		if !strings.Contains(body, want) {
			t.Errorf("index lacks %q", want)
		}
	}
	// No inline script: the CSP admits only same-origin script files.
	if regexp.MustCompile(`<script>`).MatchString(body) {
		t.Error("index has an inline script")
	}
}

// app.js must call the API by the relative /api/greeting path (same origin),
// never an absolute or protocol-relative URL, and must never write markup.
func TestScriptCallsTheRelativeAPIPath(t *testing.T) {
	src, err := fs.ReadFile(embedded, "static/app.js")
	if err != nil {
		t.Fatal(err)
	}
	script := string(src)
	if !strings.Contains(script, "const GREETING_PATH = '/api/greeting';") || !strings.Contains(script, "fetchGreeting(GREETING_PATH") {
		t.Error("app.js does not fetch the relative /api/greeting path")
	}
	for _, forbidden := range []*regexp.Regexp{
		regexp.MustCompile(`(?i)https?:`),           // absolute URL
		regexp.MustCompile("['\"`]//"),              // protocol-relative URL
		regexp.MustCompile(`\blocation\b|\.host\b`), // building a URL from the page's host
		regexp.MustCompile(`innerHTML|outerHTML|insertAdjacentHTML|document\.write`),
	} {
		if loc := forbidden.FindStringIndex(script); loc != nil {
			t.Errorf("app.js contains %q", script[loc[0]:loc[1]])
		}
	}
}

func TestEveryEmbeddedAssetHasAKnownType(t *testing.T) {
	err := fs.WalkDir(embedded, "static", func(name string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		w := serve(newHandler("test"), http.MethodGet, "/"+name)
		if name != "static/index.html" && w.Code != http.StatusOK {
			t.Errorf("GET /%s: status=%d; add its extension to contentTypes", name, w.Code)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestHealthzReportsTheRevision(t *testing.T) {
	w := serve(newHandler(`<b>rev</b>`), http.MethodGet, "/healthz")
	var got map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil || got["status"] != "ok" || got["revision"] != `<b>rev</b>` {
		t.Fatalf("body=%q error=%v", w.Body.String(), err)
	}
	if strings.Contains(w.Body.String(), "<b>") {
		t.Fatal("revision was not JSON-escaped")
	}
}

func TestHEAD(t *testing.T) {
	server := httptest.NewServer(newHandler("test"))
	t.Cleanup(server.Close)
	for _, path := range []string{"/", "/static/app.js", "/healthz"} {
		response, err := server.Client().Head(server.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		body, readErr := io.ReadAll(response.Body)
		_ = response.Body.Close()
		if readErr != nil || response.StatusCode != http.StatusOK || len(body) != 0 {
			t.Fatalf("HEAD %s: status=%d bytes=%d error=%v", path, response.StatusCode, len(body), readErr)
		}
	}
}
