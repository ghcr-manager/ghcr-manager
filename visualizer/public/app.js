import cytoscape from "/vendor/cytoscape.js";

const elements = {
  form: document.querySelector("#search-form"),
  owner: document.querySelector("#owner"),
  packageName: document.querySelector("#package"),
  scanId: document.querySelector("#scan-id"),
  lookupMode: document.querySelector("#lookup-mode"),
  lookupValue: document.querySelector("#lookup-value"),
  depth: document.querySelector("#depth"),
  status: document.querySelector("#status"),
  detailsEmpty: document.querySelector("#details-empty"),
  details: document.querySelector("#details"),
  expandNode: document.querySelector("#expand-node"),
  centerNode: document.querySelector("#center-node"),
  showRawJson: document.querySelector("#show-raw-json"),
  rawJsonDialog: document.querySelector("#raw-json-dialog"),
  closeRawJson: document.querySelector("#close-raw-json"),
  rawJsonContent: document.querySelector("#raw-json-content"),
  detailDigest: document.querySelector("#detail-digest"),
  detailVersion: document.querySelector("#detail-version"),
  detailKind: document.querySelector("#detail-kind"),
  detailMediaType: document.querySelector("#detail-media-type"),
  detailArtifactType: document.querySelector("#detail-artifact-type"),
  detailSubject: document.querySelector("#detail-subject"),
  detailTags: document.querySelector("#detail-tags")
};

const state = {
  currentGraph: null,
  graphContext: null,
  positionsByDigest: new Map(),
  positionsByViewKey: new Map(),
  selectedDigest: null,
  selectedManifestDetails: null
};

const cy = cytoscape({
  container: document.querySelector("#graph"),
  style: [
    {
      selector: "node",
      style: {
        "background-color": "data(nodeColor)",
        shape: "round-rectangle",
        label: "data(label)",
        color: "#102017",
        "font-size": 11,
        "font-weight": 600,
        "text-wrap": "wrap",
        "text-max-width": 140,
        "text-valign": "center",
        "text-halign": "center",
        "background-opacity": 0.22,
        "border-width": 3,
        "border-color": "data(borderColor)",
        width: 156,
        height: 84,
        padding: 12
      }
    },
    {
      selector: "node.center",
      style: {
        "border-width": 4,
        "overlay-color": "#8d4d10",
        "overlay-opacity": 0.08,
        "overlay-padding": 8
      }
    },
    {
      selector: "node.selected",
      style: {
        "border-width": 4,
        "overlay-color": "#165a86",
        "overlay-opacity": 0.12,
        "overlay-padding": 8
      }
    },
    {
      selector: "edge",
      style: {
        width: 3,
        "curve-style": "bezier",
        "line-color": "#41594c",
        "target-arrow-color": "#41594c",
        "target-arrow-shape": "triangle",
        label: "data(kind)",
        "font-size": 9,
        "text-rotation": "autorotate",
        "text-background-color": "#edf2f0",
        "text-background-opacity": 1,
        "text-background-padding": 2
      }
    },
    {
      selector: 'edge[kind = "referrer"]',
      style: {
        "line-style": "dashed"
      }
    },
    {
      selector: 'edge[kind = "digest-tag-referrer"]',
      style: {
        "line-style": "dotted"
      }
    }
  ]
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await loadGraphFromForm();
});

elements.expandNode.addEventListener("click", async () => {
  await expandSelectedNode();
});

elements.centerNode.addEventListener("click", async () => {
  await centerSelectedNode();
});

elements.showRawJson.addEventListener("click", () => {
  if (!state.selectedManifestDetails?.rawJson) {
    return;
  }

  elements.rawJsonContent.textContent = JSON.stringify(JSON.parse(state.selectedManifestDetails.rawJson), null, 2);
  elements.rawJsonDialog.showModal();
});

elements.closeRawJson.addEventListener("click", () => {
  elements.rawJsonDialog.close();
});

cy.on("tap", "node", async (event) => {
  await selectNode(event.target.id());
});

async function loadGraphFromForm() {
  persistCurrentLayoutState();
  setStatus("Resolving manifest...");
  const resolved = await fetchJson(resolveUrl());
  await loadGraph(resolved.digest);
}

async function loadGraph(centerDigest) {
  persistCurrentLayoutState();
  const url = packageBaseUrl("/graph");
  url.searchParams.set("center_digest", centerDigest);
  url.searchParams.set("depth", elements.depth.value);
  appendOptionalScan(url);
  setStatus("Loading graph...");
  const graph = await fetchJson(url);
  state.currentGraph = graph;
  renderGraph(graph, "replace");
  setStatus(`Loaded ${graph.nodes.length} manifests and ${graph.edges.length} edges.`);
  await selectNode(centerDigest);
}

async function expandSelectedNode() {
  if (!state.currentGraph || !state.selectedDigest) {
    return;
  }

  persistCurrentLayoutState();
  const url = packageBaseUrl("/graph");
  url.searchParams.set("center_digest", state.selectedDigest);
  url.searchParams.set("depth", "1");
  appendOptionalScan(url);
  setStatus(`Expanding ${shortDigest(state.selectedDigest)}...`);
  const expansionGraph = await fetchJson(url);
  const previousNodeCount = state.currentGraph.nodes.length;
  const mergedGraph = mergeGraphs(state.currentGraph, expansionGraph);
  state.currentGraph = mergedGraph;
  renderGraph(mergedGraph, "expand", {
    expansionSourceDigest: state.selectedDigest
  });
  const addedNodeCount = mergedGraph.nodes.length - previousNodeCount;
  setStatus(
    addedNodeCount > 0
      ? `Expanded ${shortDigest(state.selectedDigest)} by ${addedNodeCount} manifests.`
      : `No new manifests found from ${shortDigest(state.selectedDigest)}.`
  );
  await selectNode(state.selectedDigest);
}

async function centerSelectedNode() {
  if (!state.selectedDigest) {
    return;
  }

  await loadGraph(state.selectedDigest);
}

async function selectNode(digest) {
  state.selectedDigest = digest;
  syncSelectedNodeClass();
  await loadManifestDetails(digest);
}

async function loadManifestDetails(digest) {
  const url = packageBaseUrl(`/manifests/${encodeURIComponent(digest)}`);
  appendOptionalScan(url);
  const details = await fetchJson(url);
  state.selectedManifestDetails = details;
  elements.details.hidden = false;
  elements.detailsEmpty.hidden = true;
  elements.detailDigest.textContent = details.digest;
  elements.detailVersion.textContent = String(details.versionId);
  elements.detailKind.textContent = details.manifestKind ?? "-";
  elements.detailMediaType.textContent = details.mediaType;
  elements.detailArtifactType.textContent = details.artifactType ?? "-";
  elements.detailSubject.textContent = details.subjectDigest ?? "-";
  elements.detailTags.textContent = details.tags.join(", ") || "-";
  elements.expandNode.disabled = false;
  elements.centerNode.disabled = state.currentGraph?.centerDigest === digest;
  elements.showRawJson.disabled = !details.rawJson;
}

function renderGraph(graph, mode, options = {}) {
  const viewKey = buildGraphViewKey(graph);
  const previousPositions = state.positionsByViewKey.get(viewKey) ?? state.positionsByDigest;
  const nextContext = buildGraphContext(graph);
  const preservePositions = isSameGraphContext(state.graphContext, nextContext);
  const newDigests = new Set();

  cy.elements().remove();
  cy.add(
    graph.nodes.map((node) => ({
      group: "nodes",
      data: {
        id: node.id,
        label: buildNodeLabel(node),
        fullDigest: node.digest,
        borderColor: kindBorderColor(node.manifestKind),
        nodeColor: kindFillColor(node.manifestKind)
      },
      classes: buildNodeClasses(node, graph),
      position: resolveNodePosition(node, graph, preservePositions, previousPositions, mode, options)
    }))
  );
  cy.add(
    graph.edges.map((edge) => ({
      group: "edges",
      data: {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        kind: edge.kind
      }
    }))
  );

  if (preservePositions) {
    for (const node of graph.nodes) {
      if (!previousPositions.has(node.digest)) {
        newDigests.add(node.digest);
      }
    }
  }

  const layoutOptions =
    mode === "expand"
      ? { name: "preset", fit: true, padding: 30 }
      : preservePositions && newDigests.size === 0
        ? { name: "preset", fit: true, padding: 30 }
        : { name: "cose", animate: false, fit: true, padding: 30, randomize: false };
  cy.layout(layoutOptions).run();
  state.graphContext = nextContext;
  state.positionsByDigest = captureNodePositions();
  state.positionsByViewKey.set(viewKey, state.positionsByDigest);
  syncSelectedNodeClass();
}

function buildNodeLabel(node) {
  const primaryLine = kindLabel(node);
  const secondaryLines = node.tags.length > 0 ? [node.tags[0]] : [`#${node.versionId}`];

  if (node.tags.length > 1) {
    secondaryLines.push(node.tags.slice(1).join(" | "));
  }

  return [primaryLine, "", ...secondaryLines].join("\n");
}

function shortDigest(digest) {
  if (!digest.startsWith("sha256:")) {
    return digest;
  }

  const value = digest.slice(7);
  if (value.length <= 20) {
    return digest;
  }

  return `sha256:${value.slice(0, 12)}...${value.slice(-8)}`;
}

function resolveUrl() {
  const url = packageBaseUrl("/manifests");
  appendOptionalScan(url);
  url.searchParams.set(elements.lookupMode.value, elements.lookupValue.value.trim());
  return url;
}

function packageBaseUrl(suffix) {
  const owner = encodeURIComponent(elements.owner.value.trim());
  const packageName = encodeURIComponent(elements.packageName.value.trim());
  return new URL(`/api/packages/${owner}/${packageName}${suffix}`, window.location.origin);
}

function appendOptionalScan(url) {
  const scanId = elements.scanId.value.trim();
  if (scanId) {
    url.searchParams.set("scan_id", scanId);
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `HTTP ${response.status}`;
    setStatus(message);
    throw new Error(message);
  }

  return body;
}

function setStatus(message) {
  elements.status.textContent = message;
}

function buildGraphContext(graph) {
  return {
    owner: graph.owner,
    packageName: graph.packageName,
    scanId: graph.scanId,
    centerDigest: graph.centerDigest
  };
}

function buildGraphViewKey(graph) {
  const digests = graph.nodes
    .map((node) => node.digest)
    .sort()
    .join(",");
  return `${graph.owner}/${graph.packageName}#${graph.scanId}#${graph.centerDigest}#${graph.depth}#${digests}`;
}

function isSameGraphContext(left, right) {
  return (
    left &&
    right &&
    left.owner === right.owner &&
    left.packageName === right.packageName &&
    left.scanId === right.scanId &&
    left.centerDigest === right.centerDigest
  );
}

function captureNodePositions() {
  const positions = new Map();
  for (const node of cy.nodes()) {
    const position = node.position();
    positions.set(node.id(), {
      x: position.x,
      y: position.y
    });
  }

  return positions;
}

function persistCurrentLayoutState() {
  if (!state.currentGraph) {
    return;
  }

  const positions = captureNodePositions();
  state.positionsByDigest = positions;
  state.positionsByViewKey.set(buildGraphViewKey(state.currentGraph), positions);
}

function buildNodeClasses(node, graph) {
  const classes = [];
  if (node.digest === graph.centerDigest) {
    classes.push("center");
  }
  if (node.digest === state.selectedDigest) {
    classes.push("selected");
  }

  return classes.join(" ");
}

function resolveNodePosition(node, graph, preservePositions, previousPositions, mode, options) {
  if (!preservePositions) {
    return undefined;
  }

  const existingPosition = previousPositions.get(node.digest);
  if (existingPosition) {
    return existingPosition;
  }

  if (mode !== "expand" || !options.expansionSourceDigest) {
    return undefined;
  }

  return buildExpansionPosition(node.digest, options.expansionSourceDigest, graph, previousPositions);
}

function buildExpansionPosition(digest, expansionSourceDigest, graph, previousPositions) {
  const sourcePosition = previousPositions.get(expansionSourceDigest);
  if (!sourcePosition) {
    return undefined;
  }

  const newDigests = graph.nodes
    .map((node) => node.digest)
    .filter((nodeDigest) => !previousPositions.has(nodeDigest))
    .sort();
  const index = newDigests.indexOf(digest);
  if (index < 0) {
    return undefined;
  }

  const angle = (Math.PI * 2 * index) / Math.max(newDigests.length, 1);
  const radius = 180;
  return {
    x: sourcePosition.x + Math.cos(angle) * radius,
    y: sourcePosition.y + Math.sin(angle) * radius
  };
}

function mergeGraphs(currentGraph, expansionGraph) {
  const nodesByDigest = new Map(currentGraph.nodes.map((node) => [node.digest, node]));
  const edgesById = new Map(currentGraph.edges.map((edge) => [edge.id, edge]));

  for (const node of expansionGraph.nodes) {
    nodesByDigest.set(node.digest, node);
  }
  for (const edge of expansionGraph.edges) {
    edgesById.set(edge.id, edge);
  }

  return {
    ...currentGraph,
    nodes: [...nodesByDigest.values()].sort((left, right) => left.digest.localeCompare(right.digest)),
    edges: [...edgesById.values()].sort((left, right) => left.id.localeCompare(right.id))
  };
}

function syncSelectedNodeClass() {
  cy.nodes().removeClass("selected");
  if (!state.selectedDigest) {
    elements.expandNode.disabled = true;
    elements.centerNode.disabled = true;
    elements.showRawJson.disabled = true;
    return;
  }

  const node = cy.getElementById(state.selectedDigest);
  if (node.length > 0) {
    node.addClass("selected");
  }
}

function kindLabel(node) {
  const manifestKind = node.manifestKind;
  return kindShortLabel(manifestKind);
}

function kindShortLabel(manifestKind) {
  switch (manifestKind) {
    case "multi_arch_manifest":
      return "multi-arch";
    case "index_manifest":
      return "index";
    case "image_manifest":
      return "image";
    case "attestation_manifest":
      return "attestation";
    case "signature_manifest":
      return "signature";
    case "artifact_manifest":
      return "artifact";
    default:
      return "unknown";
  }
}

function kindBorderColor(manifestKind) {
  switch (manifestKind) {
    case "multi_arch_manifest":
      return "#0b4f8a";
    case "index_manifest":
      return "#00695c";
    case "image_manifest":
      return "#2e7d32";
    case "attestation_manifest":
      return "#b26a00";
    case "signature_manifest":
      return "#7b1fa2";
    case "artifact_manifest":
      return "#5f6368";
    default:
      return "#355446";
  }
}

function kindFillColor(manifestKind) {
  switch (manifestKind) {
    case "multi_arch_manifest":
      return "#c6e0ff";
    case "index_manifest":
      return "#c8efe6";
    case "image_manifest":
      return "#cdeece";
    case "attestation_manifest":
      return "#f6dbb2";
    case "signature_manifest":
      return "#e8cdf8";
    case "artifact_manifest":
      return "#d8dce0";
    default:
      return "#d1dfd7";
  }
}
