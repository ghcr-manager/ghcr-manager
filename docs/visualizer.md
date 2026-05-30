# Visualizer

`ghcr-manager-visualizer` is a local browser UI for inspecting manifest graphs stored in a `ghcr-manager` SQLite DB.

Use it when you want to:

- inspect one package graph in detail
- compare two scans of the same package
- investigate cleanup edge cases before changing planner or execution logic

## Install

Install the visualizer separately from the main `ghcr-manager` CLI:

```sh
npm install --global ghcr-manager-visualizer
```

## Run

Start the local server against a scan DB:

```sh
ghcr-manager-visualizer --db ./artifacts/acme__demo.sqlite
```

The command prints a local URL such as:

```text
Visualizer listening at http://127.0.0.1:43217
```

Open that URL in your browser.

Optional flags:

- `--host <host>`: override the bind host. Default: `127.0.0.1`
- `--port <port>`: override the bind port. Default: `0` (pick a free port)

Example:

```sh
ghcr-manager-visualizer --db ./artifacts/acme__demo.sqlite --host 0.0.0.0 --port 4000
```

## DB Sources

The visualizer reads the same SQLite DB format produced by:

- `ghcr-manager scan`
- `ghcr-manager cleanup`
- `ghcr-manager db-merge`
- GitHub Action DB artifacts uploaded by `ghcr-manager`

Typical flow:

1. Run `scan` or `cleanup` and keep the SQLite DB.
2. Start `ghcr-manager-visualizer` with that DB.
3. Enter owner, package, and a tag or digest to center the graph.
4. Optionally enter a second scan id to compare two scans of the same package.

## Source Checkout

From this repository checkout, you can run the visualizer without publishing:

```sh
npm run visualize -- --db ./artifacts/acme__demo.sqlite
```

Or build and run the workspace directly:

```sh
npm run build:visualizer
npm run visualizer:start -- --db ./artifacts/acme__demo.sqlite
```
