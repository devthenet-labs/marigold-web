// Copyright 2026 DevTheNet Labs.
// SPDX-License-Identifier: MIT

package main

import (
	"embed"
	"encoding/json"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// The page and its assets are compiled into the binary.
//
//go:embed static
var embedded embed.FS

// contentTypes are the asset types served under /static/, set explicitly so
// the answer never depends on the host's MIME tables. A file with any other
// extension is not served.
var contentTypes = map[string]string{
	".css":  "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".ico":  "image/x-icon",
	".js":   "text/javascript; charset=utf-8",
	".json": "application/json",
	".png":  "image/png",
	".svg":  "image/svg+xml",
	".txt":  "text/plain; charset=utf-8",
}

// csp admits only this origin: the page's own script and stylesheet, and the
// script's same-origin call to /api/greeting.
const csp = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; " +
	"base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

// newHandler serves the page at /, its assets under /static/ and /healthz.
// It serves nothing under /api: in a preview the load balancer routes /api to
// the marigold-api service, and the page calls it from the browser.
func newHandler(revision string) http.Handler {
	static, err := fs.Sub(embedded, "static")
	if err != nil {
		panic(err)
	}
	index, err := fs.ReadFile(static, "index.html")
	if err != nil {
		panic(err)
	}
	files := http.FileServerFS(static)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", contentTypes[".html"])
		_, _ = w.Write(index)
	})
	mux.HandleFunc("GET /static/", func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(r.URL.Path, "/static/")
		contentType, ok := contentTypes[path.Ext(name)]
		// Answer misses here: the file server's own error page drops the
		// Cache-Control header.
		if info, err := fs.Stat(static, name); !ok || err != nil || info.IsDir() {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", contentType)
		http.StripPrefix("/static", files).ServeHTTP(w, r)
	})
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "revision": revision})
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Content-Security-Policy", csp)
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cache-Control", "no-store")
		mux.ServeHTTP(w, r)
	})
}
