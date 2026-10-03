# marigold-web

A small, benign Go static frontend: the page half of the Marigold demo, whose API is
[marigold-api](https://github.com/devthenet-labs/marigold-api). No accounts, storage, secrets or outbound requests,
and no dependencies beyond the Go standard library.

Routes on port 8080:

- `GET /`: the page (`static/index.html`).
- `GET /static/...`: its script and stylesheet, embedded in the binary.
- `GET /healthz`: `{"status":"ok","revision":"<commit>"}`.

It serves **nothing under `/api`**. In a preview, one host serves both apps: the load balancer sends `/api/...` to
marigold-api and everything else here. `static/app.js` calls `fetch('/api/greeting')` from the browser, same-origin,
and shows the greeting, or "API unavailable" if the call fails. The web server never calls the API itself (preview pods
cannot reach one another), and the page's Content-Security-Policy admits only its own origin.

## Develop

Use Go 1.26.6 and Node 20 or later (for the script's tests only).

```sh
gofmt -l .
go vet ./...
go test -race ./...
node --test .github/publish/guard.test.cjs test/app.test.cjs
python3 -m unittest discover -s .github/publish -p 'test_*.py'
go run .
```

Run on its own, the page shows "API unavailable": there is no API on its origin. To see both together locally, run
marigold-api too and put any path-routing proxy in front (`/api` to the API, everything else here).

The root `Dockerfile` builds the runtime image: a static binary on distroless `static-debian12:nonroot`, uid 65532, no
shell, listening on 8080. It writes nothing, so it runs with a read-only root filesystem:

```sh
docker build --build-arg BUILD_SHA="$(git rev-parse HEAD)" -t marigold-web:local .
docker run --rm --read-only --cap-drop ALL --security-opt no-new-privileges \
  -p 127.0.0.1:8080:8080 marigold-web:local
```

`.patchy/Dockerfile` is a different image: patchy's agent base plus the pinned Go toolchain, offline
(`GOPROXY=off`), with no application source baked in. `.patchy/agent.yaml` names its immutable `toolchain-v1` tag, which
the agent publisher pushes from main. (The toolchain has no Node; `test/app.test.cjs` runs in CI.)

## CI and images

- `test` (`ci.yml`) checks formatting, vets and race-tests the exact head, runs the script's and the publishers' tests
  and actionlint, and builds the runtime image as an OCI artifact **without credentials or OIDC**. PR runs supersede
  older runs of the same PR; main runs are never cancelled, so every main commit gets its image.
- `agent image` builds the toolchain image on main, also uncredentialed.
- `publish images` is the trusted, main-context publisher (`workflow_run`). It never runs PR code: it re-reads the run
  from GitHub's API, validates the OCI archive as data, and only then assumes a narrowly scoped role to copy it:
  - runtime: `sha-<commit>` for open same-repository PR heads and main commits; main commits are also tagged
    `main-<commit>` so the registry keeps them for previews of an unchanged repository;
  - agent: `toolchain-v1`, from main only.

See [SECURITY.md](SECURITY.md) for the trust boundary and the repository variables.
