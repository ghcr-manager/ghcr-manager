import cytoscape from "/vendor/cytoscape.js";

const elements = {
  form: document.querySelector("#search-form"),
  owner: document.querySelector("#owner"),
  packageName: document.querySelector("#package"),
  scanId: document.querySelector("#scan-id"),
  compareScanId: document.querySelector("#compare-scan-id"),
  lookupMode: document.querySelector("#lookup-mode"),
  lookupValue: document.querySelector("#lookup-value"),
  lookupSuggestions: document.querySelector("#lookup-suggestions"),
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
  detailCreatedAt: document.querySelector("#detail-created-at"),
  detailUpdatedAt: document.querySelector("#detail-updated-at"),
  detailKind: document.querySelector("#detail-kind"),
  detailMediaType: document.querySelector("#detail-media-type"),
  detailPlatform: document.querySelector("#detail-platform"),
  detailArtifactType: document.querySelector("#detail-artifact-type"),
  detailSubject: document.querySelector("#detail-subject"),
  detailTags: document.querySelector("#detail-tags"),
  zoomIn: document.querySelector("#zoom-in"),
  zoomOut: document.querySelector("#zoom-out"),
  zoomFit: document.querySelector("#zoom-fit")
};

const state = {
  currentGraph: null,
  graphContext: null,
  positionsByDigest: new Map(),
  positionsByViewKey: new Map(),
  selectedDigest: null,
  selectedManifestDetails: null,
  lookupSuggestionRequestId: 0
};

const _ZOOM_STEP = 1.15;
const _GRAPH_PADDING = 30;
const _WHEEL_SENSITIVITY = 0.18;

const cy = cytoscape({
  container: document.querySelector("#graph"),
  wheelSensitivity: _WHEEL_SENSITIVITY,
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
      selector: "node.removed",
      style: {
        opacity: 0.72
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

elements.owner.addEventListener("change", async () => {
  await handleOwnerChange();
});

elements.packageName.addEventListener("change", async () => {
  await handlePackageChange();
});

elements.scanId.addEventListener("change", () => {
  clearLookupSuggestions();
});

elements.lookupMode.addEventListener("change", () => {
  clearLookupSuggestions();
});

elements.lookupValue.addEventListener("input", async () => {
  await updateLookupSuggestions();
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

elements.zoomIn.addEventListener("click", () => {
  zoomBy(_ZOOM_STEP);
});

elements.zoomOut.addEventListener("click", () => {
  zoomBy(1 / _ZOOM_STEP);
});

elements.zoomFit.addEventListener("click", () => {
  cy.fit(undefined, _GRAPH_PADDING);
});

cy.on("tap", "node", async (event) => {
  await selectNode(event.target.id());
});

await initializeSelectors();

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
  appendOptionalScanParams(url);
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
  appendOptionalScanParams(url);
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
  appendOptionalScanParams(url);
  const details = await fetchJson(url);
  state.selectedManifestDetails = details;
  elements.details.hidden = false;
  elements.detailsEmpty.hidden = true;
  elements.detailDigest.textContent = details.digest;
  elements.detailVersion.textContent = String(details.versionId);
  elements.detailCreatedAt.textContent = details.createdAt;
  elements.detailUpdatedAt.textContent = details.updatedAt;
  elements.detailKind.textContent = details.manifestKind ?? "-";
  elements.detailMediaType.textContent = details.mediaType;
  elements.detailPlatform.textContent = details.displayPlatform ?? "-";
  elements.detailArtifactType.textContent = details.artifactType ?? "-";
  elements.detailSubject.textContent = details.subjectDigest ?? "-";
  renderTagList(elements.detailTags, details.tags);
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
        borderColor: nodeBorderColor(node),
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
      ? { name: "preset", fit: true, padding: _GRAPH_PADDING }
      : preservePositions && newDigests.size === 0
        ? { name: "preset", fit: true, padding: _GRAPH_PADDING }
        : { name: "cose", animate: false, fit: true, padding: _GRAPH_PADDING, randomize: false };
  cy.layout(layoutOptions).run();
  state.graphContext = nextContext;
  state.positionsByDigest = captureNodePositions();
  state.positionsByViewKey.set(viewKey, state.positionsByDigest);
  syncSelectedNodeClass();
}

function buildNodeLabel(node) {
  const primaryLine = kindLabel(node);
  const secondaryLines = [];

  if (node.displayPlatform) {
    secondaryLines.push(node.displayPlatform);
  }

  secondaryLines.push(node.tags.length > 0 ? buildTagDisplayText(node.tags[0]) : `#${node.versionId}`);

  if (node.tags.length > 1) {
    secondaryLines.push(node.tags.slice(1).map(buildTagDisplayText).join(" | "));
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
  appendOptionalScanParams(url);
  url.searchParams.set(elements.lookupMode.value, elements.lookupValue.value.trim());
  return url;
}

async function initializeSelectors() {
  try {
    setStatus("Loading owners...");
    const owners = await fetchJson(new URL("/api/owners", window.location.origin));
    replaceOptions(elements.owner, owners, "owner", "Select owner");
    const ownerValues = owners.map((entry) => entry.owner);
    elements.owner.value =
      _pickInitialValue(elements.owner.value, ownerValues) || (ownerValues.length === 1 ? ownerValues[0] : "");
    await handleOwnerChange({ preservePackageSelection: true, preserveScanSelection: true });
    setStatus("");
  } catch (error) {
    if (error instanceof Error) {
      setStatus(error.message);
    }
  }
}

async function handleOwnerChange(options = {}) {
  const previousPackage = elements.packageName.value;
  const previousScanId = elements.scanId.value;
  const previousCompareScanId = elements.compareScanId.value;
  resetSelect(elements.packageName, "Select package", true);
  resetSelect(elements.scanId, "Latest completed scan", true);
  resetSelect(elements.compareScanId, "None", true);
  clearLookupSuggestions();

  const owner = elements.owner.value;
  if (!owner) {
    return;
  }

  setStatus("Loading packages...");
  const packages = await fetchJson(
    new URL(`/api/owners/${encodeURIComponent(owner)}/packages`, window.location.origin)
  );
  replaceOptions(elements.packageName, packages, "packageName", "Select package");
  const packageValues = packages.map((entry) => entry.packageName);
  const initialPackage = options.preservePackageSelection
    ? _pickInitialValue(previousPackage, packageValues) || (packageValues.length === 1 ? packageValues[0] : "")
    : packageValues.length === 1
      ? packageValues[0]
      : "";
  if (initialPackage) {
    elements.packageName.value = initialPackage;
  }

  if (options.preserveScanSelection === true) {
    elements.scanId.value = previousScanId;
    elements.compareScanId.value = previousCompareScanId;
  }
  await handlePackageChange({
    preserveScanSelection: options.preserveScanSelection === true,
    previousScanId,
    previousCompareScanId
  });
}

async function handlePackageChange(options = {}) {
  const previousScanId = options.previousScanId ?? elements.scanId.value;
  const previousCompareScanId = options.previousCompareScanId ?? elements.compareScanId.value;
  resetSelect(elements.scanId, "Latest completed scan", true);
  resetSelect(elements.compareScanId, "None", true);
  clearLookupSuggestions();

  const owner = elements.owner.value;
  const packageName = elements.packageName.value;
  if (!owner || !packageName) {
    return;
  }

  setStatus("Loading scans...");
  const scans = await fetchJson(
    new URL(
      `/api/packages/${encodeURIComponent(owner)}/${encodeURIComponent(packageName)}/scans`,
      window.location.origin
    )
  );
  replaceScanOptions(scans, {
    preserveSelection: options.preserveScanSelection === true,
    previousScanId,
    previousCompareScanId
  });
  setStatus("");
}

async function updateLookupSuggestions() {
  if (elements.lookupMode.value !== "tag") {
    clearLookupSuggestions();
    return;
  }

  const owner = elements.owner.value;
  const packageName = elements.packageName.value;
  const query = elements.lookupValue.value.trim();
  if (!owner || !packageName || query === "") {
    clearLookupSuggestions();
    return;
  }

  const requestId = ++state.lookupSuggestionRequestId;
  const url = packageBaseUrl("/tags");
  appendOptionalScanParams(url);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "20");
  try {
    const tags = await fetchJson(url);
    if (requestId !== state.lookupSuggestionRequestId) {
      return;
    }

    replaceLookupSuggestions(tags.map((entry) => entry.tagName));
  } catch {
    if (requestId === state.lookupSuggestionRequestId) {
      clearLookupSuggestions();
    }
  }
}

function packageBaseUrl(suffix) {
  const owner = encodeURIComponent(elements.owner.value.trim());
  const packageName = encodeURIComponent(elements.packageName.value.trim());
  return new URL(`/api/packages/${owner}/${packageName}${suffix}`, window.location.origin);
}

function appendOptionalScanParams(url) {
  const scanId = elements.scanId.value.trim();
  if (scanId) {
    url.searchParams.set("scan_id", scanId);
  }

  const compareScanId = elements.compareScanId.value.trim();
  if (compareScanId) {
    url.searchParams.set("compare_scan_id", compareScanId);
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

function replaceLookupSuggestions(values) {
  elements.lookupSuggestions.replaceChildren(...values.map((value) => buildOption(value, value)));
}

function clearLookupSuggestions() {
  state.lookupSuggestionRequestId += 1;
  elements.lookupSuggestions.replaceChildren();
}

function replaceOptions(select, entries, valueKey, placeholderLabel) {
  const selectedValue = select.value;
  select.replaceChildren(buildOption("", placeholderLabel));
  for (const entry of entries) {
    select.append(buildOption(entry[valueKey], entry[valueKey]));
  }
  select.disabled = entries.length === 0;
  select.value = _pickInitialValue(
    selectedValue,
    entries.map((entry) => entry[valueKey])
  );
}

function replaceScanOptions(scans, options = {}) {
  const selectedScanId = options.preserveSelection ? (options.previousScanId ?? "") : "";
  const selectedCompareScanId = options.preserveSelection ? (options.previousCompareScanId ?? "") : "";

  elements.scanId.replaceChildren(buildOption("", "Latest completed scan"));
  elements.compareScanId.replaceChildren(buildOption("", "None"));
  for (const scan of scans) {
    const label = formatScanLabel(scan);
    elements.scanId.append(buildOption(String(scan.scanId), label));
    elements.compareScanId.append(buildOption(String(scan.scanId), label));
  }

  const scanValues = scans.map((scan) => String(scan.scanId));
  elements.scanId.disabled = scans.length === 0;
  elements.compareScanId.disabled = scans.length === 0;
  elements.scanId.value = _pickInitialValue(selectedScanId, scanValues) || _defaultScanId(scans);
  elements.compareScanId.value =
    _pickInitialValue(selectedCompareScanId, scanValues) || _defaultCompareScanId(scans, elements.scanId.value);
}

function buildOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function resetSelect(select, placeholderLabel, disabled) {
  select.replaceChildren(buildOption("", placeholderLabel));
  select.disabled = disabled;
}

function formatScanLabel(scan) {
  return `#${scan.scanId} ${scan.scanCompletedAt}`;
}

function _pickInitialValue(currentValue, allowedValues) {
  return allowedValues.includes(currentValue) ? currentValue : "";
}

function _defaultScanId(scans) {
  if (scans.length === 0) {
    return "";
  }

  if (scans.length === 1) {
    return String(scans[0].scanId);
  }

  return String(scans[1].scanId);
}

function _defaultCompareScanId(scans, selectedScanId) {
  if (scans.length < 2) {
    return "";
  }

  const newestScanId = String(scans[0].scanId);
  return newestScanId === selectedScanId ? "" : newestScanId;
}

function buildGraphContext(graph) {
  return {
    owner: graph.owner,
    packageName: graph.packageName,
    scanId: graph.scanId,
    compareScanId: graph.compareScanId ?? null,
    centerDigest: graph.centerDigest
  };
}

function buildGraphViewKey(graph) {
  const digests = graph.nodes
    .map((node) => node.digest)
    .sort()
    .join(",");
  return `${graph.owner}/${graph.packageName}#${graph.scanId}#${graph.compareScanId ?? ""}#${graph.centerDigest}#${graph.depth}#${digests}`;
}

function isSameGraphContext(left, right) {
  return (
    left &&
    right &&
    left.owner === right.owner &&
    left.packageName === right.packageName &&
    left.scanId === right.scanId &&
    left.compareScanId === right.compareScanId &&
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
  if (node.changeStatus === "removed") {
    classes.push("removed");
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

function buildTagDisplayText(tag) {
  switch (tag.changeStatus) {
    case "added":
      return `(+) ${tag.name}`;
    case "removed":
      return `(-) ${tag.name}`;
    default:
      return tag.name;
  }
}

function renderTagList(container, tags) {
  container.replaceChildren();
  container.classList.remove("tag-list");
  if (tags.length === 0) {
    container.textContent = "-";
    return;
  }

  container.classList.add("tag-list");
  for (const tag of tags) {
    const tagElement = document.createElement("span");
    tagElement.className = `tag ${tag.changeStatus}`;
    tagElement.textContent = buildTagDisplayText(tag);
    container.append(tagElement);
  }
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

function zoomBy(factor) {
  const currentZoom = cy.zoom();
  const nextZoom = currentZoom * factor;
  cy.zoom({
    level: nextZoom,
    renderedPosition: {
      x: cy.width() / 2,
      y: cy.height() / 2
    }
  });
}

function nodeBorderColor(node) {
  switch (node.changeStatus) {
    case "added":
      return "#0b8f3a";
    case "removed":
      return "#d32f2f";
    default:
      return "#6b7280";
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
