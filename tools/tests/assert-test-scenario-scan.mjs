#!/usr/bin/env node
/* global process */

import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { scenarios } from "./test-scenarios/_definitions.mjs";
import { resolveScenarioTagNames } from "./test-scenarios/_resolve-tag-names.mjs";

const scenarioId = process.argv[2];
const dbPath = process.argv[3];

if (!scenarioId || !dbPath) {
  throw new Error("usage: node tools/tests/assert-test-scenario-scan.mjs <scenario> <db-path>");
}

const scenario = scenarios[scenarioId];
if (!scenario) {
  throw new Error(`unknown scenario: ${scenarioId}`);
}

const scanAssertions = scenario.scanAssertions ?? [];
const latestScanAssertions = scenario.latestScanAssertions;
const signatureSubjectAssertions = scenario.signatureSubjectAssertions ?? [];
if (!latestScanAssertions && scanAssertions.length === 0 && signatureSubjectAssertions.length === 0) {
  process.stdout.write(`No scan assertions configured for scenario '${scenarioId}'.\n`);
  process.exit(0);
}

const tagNames = resolveScenarioTagNames(scenario);
const database = new Database(dbPath, { readonly: true });

const latestScan = database
  .prepare(
    `
      SELECT scan_id
      FROM package_scans
      WHERE status = 'completed'
      ORDER BY scan_id DESC
      LIMIT 1
    `
  )
  .get();

assert.ok(latestScan, `database '${dbPath}' did not contain a completed package scan`);

if (latestScanAssertions) {
  const counts = database
    .prepare(
      `
        SELECT
          (SELECT COUNT(*)
           FROM manifests
           WHERE scan_id = ?) AS manifestCount,
          (SELECT COUNT(DISTINCT tag)
           FROM tags
           WHERE scan_id = ?) AS tagCount
      `
    )
    .get(latestScan.scan_id, latestScan.scan_id);

  assert.equal(
    counts.manifestCount,
    latestScanAssertions.manifestCount,
    `scan ${latestScan.scan_id} had an unexpected manifest count`
  );
  assert.equal(
    counts.tagCount,
    latestScanAssertions.tagCount,
    `scan ${latestScan.scan_id} had an unexpected tag count`
  );

  for (const tagNameKey of latestScanAssertions.absentTagNameKeys ?? []) {
    const tag = tagNames[tagNameKey];
    assert.ok(tag, `scenario '${scenarioId}' is missing tag '${tagNameKey}' for latest scan assertions`);

    const row = database
      .prepare(
        `
          SELECT 1
          FROM tags
          WHERE scan_id = ?
            AND tag = ?
          LIMIT 1
        `
      )
      .get(latestScan.scan_id, tag);

    assert.equal(row, undefined, `scan ${latestScan.scan_id} unexpectedly retained tag '${tag}'`);
  }
}

for (const scanAssertion of scanAssertions) {
  const tag = tagNames[scanAssertion.tagNameKey];
  assert.ok(tag, `scenario '${scenarioId}' is missing tag '${scanAssertion.tagNameKey}' for scan assertions`);

  const row = database
    .prepare(
      `
        SELECT
          t.tag,
          m.manifest_kind,
          mp.raw_json,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM manifest_edges me
              WHERE me.scan_id = m.scan_id
                AND me.child_digest = m.digest
                AND me.edge_kind != 'digest-tag-referrer'
            )
              THEN 1
            ELSE 0
          END AS has_ancestor
        FROM tags t
        JOIN manifests m
          ON m.scan_id = t.scan_id
         AND m.version_id = t.version_id
        JOIN manifest_payloads mp
          ON mp.scan_id = m.scan_id
         AND mp.digest = m.digest
        WHERE t.scan_id = ?
          AND t.tag = ?
      `
    )
    .get(latestScan.scan_id, tag);

  assert.ok(row, `scan ${latestScan.scan_id} did not contain tagged manifest '${tag}'`);

  if (scanAssertion.requireRoot) {
    assert.equal(row.has_ancestor, 0, `tag '${tag}' did not resolve to a root manifest`);
  }

  if (scanAssertion.expectedManifestKind) {
    assert.equal(
      row.manifest_kind,
      scanAssertion.expectedManifestKind,
      `tag '${tag}' resolved to unexpected manifest kind`
    );
  }

  if (scanAssertion.expectedManifestMediaType) {
    const payload = JSON.parse(row.raw_json);
    assert.equal(
      payload.mediaType,
      scanAssertion.expectedManifestMediaType,
      `tag '${tag}' resolved to unexpected manifest payload media type`
    );
  }
}

for (const signatureAssertion of signatureSubjectAssertions) {
  const tag = tagNames[signatureAssertion.tagNameKey];
  assert.ok(tag, `scenario '${scenarioId}' is missing tag '${signatureAssertion.tagNameKey}' for signature assertions`);

  const keepRoot = database
    .prepare(
      `
        SELECT m.digest AS root_digest
        FROM tags t
        JOIN manifests m
          ON m.scan_id = t.scan_id
         AND m.version_id = t.version_id
        WHERE t.scan_id = ?
          AND t.tag = ?
      `
    )
    .get(latestScan.scan_id, tag);

  assert.ok(keepRoot, `scan ${latestScan.scan_id} did not contain a root manifest for tag '${tag}'`);

  const rows = database
    .prepare(
      `
        SELECT
          sig.digest AS signature_digest,
          sig.subject_digest,
          subjects.manifest_kind AS subject_manifest_kind,
          sig_roots.tag_count AS signature_root_tag_count
        FROM manifests sig
        JOIN manifests subjects
          ON subjects.scan_id = sig.scan_id
         AND subjects.digest = sig.subject_digest
        JOIN manifest_reachability mr
          ON mr.scan_id = sig.scan_id
         AND mr.ancestor_digest = ?
         AND mr.descendant_digest = sig.subject_digest
        WHERE sig.scan_id = ?
          AND sig.artifact_type = ?
          AND sig.subject_digest IS NOT NULL
          AND subjects.manifest_kind = ?
          ${
            signatureAssertion.requireUntaggedRoots
              ? `AND NOT EXISTS (
                   SELECT 1
                   FROM tags sig_tags
                   WHERE sig_tags.scan_id = sig.scan_id
                     AND sig_tags.version_id = sig.version_id
                     AND sig_tags.is_digest_tag = 0
                 )`
              : ""
          }
      `
    )
    .all(
      keepRoot.root_digest,
      latestScan.scan_id,
      signatureAssertion.requiredArtifactType,
      signatureAssertion.requiredSubjectManifestKind
    );

  const distinctSubjectCount = new Set(rows.map((row) => row.subject_digest)).size;
  assert.ok(
    rows.length >= signatureAssertion.minSignatureRootCount,
    `tag '${tag}' did not retain enough matching signature roots: expected at least ${signatureAssertion.minSignatureRootCount}, found ${rows.length}`
  );
  assert.ok(
    distinctSubjectCount >= signatureAssertion.minDistinctSubjectCount,
    `tag '${tag}' did not retain enough distinct signature subjects: expected at least ${signatureAssertion.minDistinctSubjectCount}, found ${distinctSubjectCount}`
  );
}

process.stdout.write(
  `Verified ${latestScanAssertions ? 1 : 0} latest-scan assertion set(s), ${scanAssertions.length} scan assertion(s), and ${signatureSubjectAssertions.length} signature assertion(s) for scenario '${scenarioId}'.\n`
);
