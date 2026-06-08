# ghcr-manager-visualizer

Local browser visualizer for `ghcr-manager` SQLite scan databases.

Use it to inspect manifest graphs, compare two scans of the same package, and investigate cleanup edge cases.

[![Example compare view: red-bordered manifests are present in the older scan and removed in the newer one.](https://raw.githubusercontent.com/ghcr-manager/ghcr-manager/main/docs/images/visualizer/graph-2images-cosign--wide.png "Example compare view: red-bordered manifests are present in the older scan and removed in the newer one.")](https://github.com/ghcr-manager/ghcr-manager/blob/main/docs/images/visualizer/graph-2images-cosign--wide.png)

_Example compare view: red-bordered manifests are present in the older scan and removed in the newer one._

## Quick Demo

Download the test scenario DB from the latest release and try the visualizer without first running your own workflow.

The DB contains dozens of scenario packages with different graphs and before/after views of cleanup operations on them.

```sh
curl -LO https://github.com/ghcr-manager/ghcr-manager/releases/latest/download/ghcr-manager-release-scenarios.sqlite
npx ghcr-manager-visualizer --db ./ghcr-manager-release-scenarios.sqlite
```

Or run the release image:

```sh
docker run --rm -p 8080:8080 \
  -v "$PWD:/data:ro" \
  ghcr.io/ghcr-manager/ghcr-manager-visualizer:latest \
  --db /data/ghcr-manager-release-scenarios.sqlite
```

Open the local URL printed by the command and select:

- owner: `ghcr-manager-test`
- package: select one with `2images` or `2multiarch` in the name
- tag search: `image` or `multiarch`

Good search terms for tags in most scenarios are: `image`, `multiarch`, `keep`, or `delete`.

For an overview of the test scenario graphs and cleanup cases, see
[test-scenarios](https://github.com/ghcr-manager/ghcr-manager/blob/main/docs/test/scenarios.md).

## Install

```sh
npm install --global ghcr-manager-visualizer
```

> Requirement: Node.js `24` or newer.

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

## Docker

Release images are published only from release tags and use these tags:

- `vX.Y.Z`
- `vX`
- `latest`

Example:

```sh
docker run --rm -p 8080:8080 \
  -v "$PWD:/data:ro" \
  ghcr.io/ghcr-manager/ghcr-manager-visualizer:v1.0.6 \
  --db /data/acme__demo.sqlite
```

Container defaults:

- host: `0.0.0.0`
- port: `8080`

## DB Input

The visualizer reads the SQLite DB produced by `ghcr-manager` as GitHub Action artifacts uploaded by `scan`, `cleanup`.

Typical flow:

1. Run a `scan` or `cleanup` workflow and download the SQLite DB run artifact.
2. Start `ghcr-manager-visualizer` with that DB.
3. Select owner and package, then enter a tag or digest to center the graph.
4. Optionally select a second scan to compare two recorded scans.

## Compare Mode

When a package has at least two completed scans, the visualizer defaults to comparing the newest two scans:

- main scan: the older of the newest two scans
- compare scan: the newest scan

In compare mode, the visualizer shows delta information in two places.

Manifest nodes:

- gray border: present in both scans
- green border: added in the newer scan
- red border: removed in the newer scan

Tags in the details panel:

- plain tag text: present in both scans
- `(+) tag-name`: tag added in the newer scan
- `(-) tag-name`: tag removed in the newer scan

This is the fastest way to inspect what changed between two scans of one package graph.

[![Visualizer Show Compare Mode](https://raw.githubusercontent.com/ghcr-manager/ghcr-manager/main/docs/images/visualizer/visualizer-show-compare-mode.png)](https://github.com/ghcr-manager/ghcr-manager/blob/main/docs/images/visualizer/visualizer-show-compare-mode.png)

_Example compare view: red-bordered manifests are present in the older scan and removed in the newer one._

[![Visualizer Show Compare Mode Tags](https://raw.githubusercontent.com/ghcr-manager/ghcr-manager/main/docs/images/visualizer/visualizer-show-compare-mode--tag-removed.png)](https://github.com/ghcr-manager/ghcr-manager/blob/main/docs/images/visualizer/visualizer-show-compare-mode--tag-removed.png)

_Example compare view: tags with '(-)' were removed. Here the manifest with the other tag remained._

## Source Checkout

From this repository checkout, you can run the visualizer without publishing:

```sh
npm run build
npm run visualize -- --db ./artifacts/acme__demo.sqlite
```

## Project

Main project and issue tracker:

- Repository: <https://github.com/ghcr-manager/ghcr-manager>
- Issues: <https://github.com/ghcr-manager/ghcr-manager/issues>
