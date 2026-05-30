# ghcr-manager-visualizer

Local browser visualizer for `ghcr-manager` SQLite scan databases.

Use it to inspect manifest graphs, compare two scans of the same package, and investigate cleanup edge cases.

## Install

```sh
npm install --global ghcr-manager-visualizer
```

## Run

```sh
ghcr-manager-visualizer --db ./artifacts/acme__demo.sqlite
```

The command prints a local URL such as `http://127.0.0.1:43217`. Open that URL in your browser.

Optional flags:

- `--host <host>`: override the bind host. Default: `127.0.0.1`
- `--port <port>`: override the bind port. Default: `0`

Example:

```sh
ghcr-manager-visualizer --db ./artifacts/acme__demo.sqlite --host 0.0.0.0 --port 4000
```

## DB Inputs

The visualizer reads the SQLite DB format produced by:

- `ghcr-manager scan`
- `ghcr-manager cleanup`
- `ghcr-manager db-merge`

## Project

Main project and issue tracker:

- Repository: <https://github.com/gh-workflow/ghcr-manager>
- Issues: <https://github.com/gh-workflow/ghcr-manager/issues>
