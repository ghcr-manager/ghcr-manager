import { ManifestKinds } from "../core/index.js";
import { DeletePlanValidationStatuses } from "../db/index.js";
import type { CleanupSummary, CleanupSummaryRoot } from "./_cleanup-summary.js";

const _DEFAULT_MAX_DIRECT_TARGET_TAGS = 100;
const _DEFAULT_MAX_ROOTS_PER_SECTION = 100;
const _DEFAULT_MAX_TAG_TEXT_LENGTH = 40;

export function renderCleanupSummaryMarkdown(
  summary: CleanupSummary,
  options: {
    maxDirectTargetTags?: number;
    maxRootsPerSection?: number;
  }
): string {
  const maxDirectTargetTags = options.maxDirectTargetTags ?? _DEFAULT_MAX_DIRECT_TARGET_TAGS;
  const maxRootsPerSection = options.maxRootsPerSection ?? _DEFAULT_MAX_ROOTS_PER_SECTION;
  const lines = [
    "## Cleanup Summary",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| 📦 Package | \`${_escapeInlineCode(`${summary.owner}/${summary.packageName}`)}\` |`,
    `| ⚙️ Mode | ${summary.dryRun ? "Cleanup dry-run" : "Cleanup"} |`,
    `| 🏷️ Selected tags | ${summary.directTargetTags.length} |`,
    `| 🔖 Deleted tags | ${summary.changes.deletedTags} |`,
    `| 🖼️ Deleted images | ${summary.changes.deletedImages} |`,
    `| 📚 Deleted multi-arch manifests | ${summary.changes.deletedMultiArchManifests} |`,
    `| 🧱 Deleted indexes | ${summary.changes.deletedIndexes} |`,
    `| 📄 Deleted total | ${summary.changes.deletedTotal} |`,
    `| 🔗 Tag-only updates | ${summary.untagOnlyRoots.length} |`,
    `| 🛡️ Blocked items | ${summary.blockedRoots.length} |`,
    ""
  ];

  lines.push(..._renderPlannedDeleteBreakdown(summary));
  lines.push(..._renderPlannerInputs(summary.plannerInputs));
  lines.push(..._renderDirectTargetTags(summary.directTargetTags, maxDirectTargetTags));
  lines.push(..._renderRootSection("🗑️ Deleted items", summary.fullyDeletableRoots, maxRootsPerSection));
  lines.push(..._renderRootSection("🔗 Tags removed only", summary.untagOnlyRoots, maxRootsPerSection));
  lines.push(..._renderRootSection("🛡️ Blocked items", summary.blockedRoots, maxRootsPerSection));

  if (!summary.dryRun && (summary.deletedPackageVersionCount > 0 || summary.detachedTagCount > 0)) {
    lines.push(..._renderLiveEffects(summary));
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function _renderPlannedDeleteBreakdown(summary: CleanupSummary): string[] {
  const rows = [
    { label: "Images", count: summary.changes.deletedImages },
    { label: "Multi-arch manifests", count: summary.changes.deletedMultiArchManifests },
    { label: "Artifact manifests", count: summary.changes.deletedArtifactManifests },
    { label: "Signatures", count: summary.changes.deletedSignatures },
    { label: "Attestations", count: summary.changes.deletedAttestations },
    { label: "Generic indexes", count: summary.changes.deletedIndexes }
  ].filter((row) => row.count > 0);

  if (rows.length === 0) {
    return [];
  }

  return [
    "<details>",
    "<summary>📦 Deleted item breakdown</summary>",
    "",
    "| Type | Count |",
    "| --- | --- |",
    ...rows.map((row) => `| ${row.label} | ${row.count} |`),
    "",
    "</details>",
    ""
  ];
}

function _renderPlannerInputs(plannerInputs: CleanupSummary["plannerInputs"]): string[] {
  const rows = _getPlannerInputRows(plannerInputs);
  const patternLines = _getPlannerPatternLines(plannerInputs);

  return [
    "<details>",
    "<summary>⚙️ Cleanup filter</summary>",
    "",
    "| Filter | Value |",
    "| --- | --- |",
    ...(rows.length > 0 ? rows : ["| (none) | No cleanup filters recorded |"]),
    ...(patternLines.length > 0 ? ["", ...patternLines] : []),
    "",
    "</details>",
    ""
  ];
}

function _renderDirectTargetTags(tags: string[], maxDirectTargetTags: number): string[] {
  if (tags.length === 0) {
    return [];
  }

  const visibleTags = tags.slice(0, maxDirectTargetTags).map((tag) => `- \`${_escapeInlineCode(tag)}\``);
  const lines = ["<details>", "<summary>🏷️ Selected tags</summary>", "", ...visibleTags];
  if (tags.length > maxDirectTargetTags) {
    lines.push("", `_Showing first ${maxDirectTargetTags} of ${tags.length} selected tags._`);
  }
  lines.push("", "</details>", "");
  return lines;
}

function _renderRootSection(title: string, roots: CleanupSummaryRoot[], maxRootsPerSection: number): string[] {
  if (roots.length === 0) {
    return [];
  }

  const lines = ["<details>", `<summary>${title}</summary>`, ""];
  lines.push("| Version | Type | Digest | Tags | Outcome |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const root of roots.slice(0, maxRootsPerSection)) {
    lines.push(
      `| ${root.versionId} | ${_escapeMarkdown(_describeManifestKind(root.manifestKind))} | \`${_escapeInlineCode(_shortDigest(root.digest))}\` | ${_escapeMarkdown(_formatTags(root))} | ${_escapeMarkdown(_formatReason(root))} |`
    );
  }

  lines.push("", "_Tag lists may be truncated for table width._");

  if (roots.length > maxRootsPerSection) {
    lines.push("", `_Showing first ${maxRootsPerSection} of ${roots.length} ${title.toLowerCase()}._`);
  }

  lines.push("", "</details>", "");
  return lines;
}

function _renderLiveEffects(summary: CleanupSummary): string[] {
  const lines = ["### Applied changes", ""];
  lines.push(`- Deleted package versions: ${summary.deletedPackageVersionCount}`);
  lines.push(`- Detached tags: ${summary.detachedTagCount}`);
  lines.push("");
  return lines;
}

function _formatTags(root: CleanupSummaryRoot): string {
  const tags = root.rootTags.length > 0 ? root.rootTags : root.matchedTags;
  if (tags.length === 0) {
    return "(untagged)";
  }

  const joinedTags = tags.join(", ");
  if (joinedTags.length <= _DEFAULT_MAX_TAG_TEXT_LENGTH) {
    return joinedTags;
  }

  return `${joinedTags.slice(0, _DEFAULT_MAX_TAG_TEXT_LENGTH - 3)}...`;
}

function _formatReason(root: CleanupSummaryRoot): string {
  if (root.validationStatus === DeletePlanValidationStatuses.blocked) {
    const blocking = root.blockingDigest ? _shortDigest(root.blockingDigest) : "another item";
    const overlap = root.overlapDigest ? ` via ${_shortDigest(root.overlapDigest)}` : "";
    return `Blocked by retained item ${blocking}${overlap}`;
  }

  if (root.validationStatus === DeletePlanValidationStatuses.untagOnly) {
    return "Remove selected tags, keep item";
  }

  return "Delete item and descendants";
}

function _shortDigest(value: string): string {
  if (!value.startsWith("sha256:") || value.length <= 20) {
    return value;
  }

  return `${value.slice(0, 15)}...${value.slice(-8)}`;
}

function _escapeInlineCode(value: string): string {
  return value.replaceAll("`", "\\`");
}

function _escapeMarkdown(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function _getPlannerInputRows(plannerInputs: CleanupSummary["plannerInputs"]): string[] {
  const rows: string[] = [];

  for (const [key, value] of Object.entries(plannerInputs)) {
    rows.push(`| ${_escapeMarkdown(_plannerInputLabel(key))} | ${_escapeMarkdown(_formatPlannerInputValue(value))} |`);
  }

  return rows;
}

function _plannerInputLabel(key: string): string {
  switch (key) {
    case "deleteTags":
      return "Delete tags";
    case "excludeTags":
      return "Exclude tags";
    case "useRegex":
      return "Use regex";
    case "deleteUntagged":
      return "Delete untagged";
    case "keepNTagged":
      return "Keep newest tagged";
    case "keepNUntagged":
      return "Keep newest untagged";
    case "olderThan":
      return "Older than";
    case "cutoffTimestamp":
      return "Cutoff timestamp";
    case "deleteGhostImages":
      return "Delete ghost images";
    case "deletePartialImages":
      return "Delete partial images";
    case "deleteOrphanedImages":
      return "Delete orphaned images";
    default:
      return key;
  }
}

function _formatPlannerInputValue(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "(none)";
    }

    return value.length === 1 ? "1 pattern" : `${value.length} patterns`;
  }

  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }

  return String(value);
}

function _getPlannerPatternLines(plannerInputs: CleanupSummary["plannerInputs"]): string[] {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(plannerInputs)) {
    if (!Array.isArray(value) || value.length === 0) {
      continue;
    }

    lines.push(`- ${_plannerInputLabel(key)}:`);
    for (const item of value) {
      lines.push(`  - \`${_escapeInlineCode(String(item))}\``);
    }
  }

  return lines;
}

function _describeManifestKind(manifestKind?: string): string {
  switch (manifestKind) {
    case ManifestKinds.imageManifest:
      return "image";
    case ManifestKinds.multiArchManifest:
      return "multi-arch";
    case ManifestKinds.indexManifest:
      return "index";
    case ManifestKinds.signatureManifest:
      return "signature";
    case ManifestKinds.attestationManifest:
      return "attestation";
    case ManifestKinds.artifactManifest:
      return "artifact";
    default:
      return "item";
  }
}
