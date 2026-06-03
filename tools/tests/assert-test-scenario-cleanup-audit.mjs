#!/usr/bin/env node
/* global console, process */

import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { scenarios } from "./test-scenarios/_definitions.mjs";
import { resolveScenarioTagNames } from "./test-scenarios/_resolve-tag-names.mjs";

/**
 * @typedef {{
 *   cleanup_run_id: number;
 *   scan_id: number;
 *   directTargetRootCount: number;
 *   fullyDeletableRootCount: number;
 *   blockedDeleteRootCount: number;
 *   protectedRootCount: number;
 * }} CleanupRunRow
 */

const scenarioId = process.argv[2];
const dbPath = process.argv[3];

if (!scenarioId || !dbPath) {
  throw new Error("usage: node tools/tests/assert-test-scenario-cleanup-audit.mjs <scenario> <db-path>");
}

const scenario = scenarios[scenarioId];
if (!scenario) {
  throw new Error(`unknown scenario: ${scenarioId}`);
}

const cleanupAuditAssertions = scenario.cleanupAuditAssertions;
if (!cleanupAuditAssertions) {
  process.stdout.write(`No cleanup audit assertions configured for scenario '${scenarioId}'.\n`);
  process.exit(0);
}

const tagNames = resolveScenarioTagNames(scenario);
const database = new Database(dbPath, { readonly: true });

try {
  const cleanupRun = database
    .prepare(
      `
        SELECT
          cleanup_run_id,
          scan_id,
          direct_target_root_count AS directTargetRootCount,
          fully_deletable_root_count AS fullyDeletableRootCount,
          blocked_delete_root_count AS blockedDeleteRootCount,
          protected_root_count AS protectedRootCount
        FROM cleanup_runs
        ORDER BY cleanup_run_id DESC
        LIMIT 1
      `
    )
    .get();

  assert.ok(cleanupRun, `database '${dbPath}' did not contain a cleanup run`);

  const tagDigestsByKey = new Map();
  for (const [tagNameKey, tag] of Object.entries(tagNames)) {
    const row = database
      .prepare(
        `
          SELECT m.digest
          FROM tags t
          JOIN manifests m
            ON m.scan_id = t.scan_id
           AND m.version_id = t.version_id
          WHERE t.scan_id = ?
            AND t.tag = ?
        `
      )
      .get(cleanupRun.scan_id, tag);

    if (row) {
      tagDigestsByKey.set(tagNameKey, row.digest);
    }
  }

  const rootDecisions = database
    .prepare(
      `
        SELECT digest, validation_status, blocking_digest
        FROM cleanup_root_decisions
        WHERE cleanup_run_id = ?
        ORDER BY digest
      `
    )
    .all(cleanupRun.cleanup_run_id);

  const protectedRoots = database
    .prepare(
      `
      SELECT DISTINCT protected_digest AS digest
      FROM cleanup_protected_root_blocks
      WHERE cleanup_run_id = ?
      ORDER BY digest
    `
    )
    .all(cleanupRun.cleanup_run_id)
    .map((row) => row.digest);

  const protectedRootBlocks = database
    .prepare(
      `
        SELECT protected_digest, blocked_digest, overlap_digest
        FROM cleanup_protected_root_blocks
        WHERE cleanup_run_id = ?
        ORDER BY protected_digest, blocked_digest, overlap_digest
      `
    )
    .all(cleanupRun.cleanup_run_id);

  for (const [key, expectedValue] of Object.entries(cleanupAuditAssertions.validationSummary ?? {})) {
    assert.equal(
      cleanupRun[key],
      expectedValue,
      `cleanup run summary '${key}' did not match for scenario '${scenarioId}'`
    );
  }

  assert.equal(
    rootDecisions.length,
    (cleanupAuditAssertions.rootDecisions ?? []).length,
    `unexpected cleanup_root_decisions row count for scenario '${scenarioId}'`
  );

  for (const expectedRootDecision of cleanupAuditAssertions.rootDecisions ?? []) {
    const digest = _requireTagDigest(tagDigestsByKey, expectedRootDecision.tagNameKey, scenarioId);
    const row = rootDecisions.find((candidate) => candidate.digest === digest);
    assert.ok(row, `missing cleanup_root_decisions row for digest '${digest}' in scenario '${scenarioId}'`);
    assert.equal(
      row.validation_status,
      expectedRootDecision.validationStatus,
      `unexpected validation status for digest '${digest}' in scenario '${scenarioId}'`
    );
  }

  const expectedProtectedDigests = (cleanupAuditAssertions.protectedTagNameKeys ?? [])
    .map((tagNameKey) => _requireTagDigest(tagDigestsByKey, tagNameKey, scenarioId))
    .sort();
  assert.equal(
    new Set(protectedRoots).size,
    protectedRoots.length,
    `cleanup_protected_roots contained duplicate digests for scenario '${scenarioId}'`
  );
  for (const expectedProtectedDigest of expectedProtectedDigests) {
    assert.ok(
      protectedRoots.includes(expectedProtectedDigest),
      `missing cleanup_protected_roots digest '${expectedProtectedDigest}' for scenario '${scenarioId}'`
    );
  }

  for (const expectedBlock of cleanupAuditAssertions.protectedRootBlocks ?? []) {
    const protectedDigest = _requireTagDigest(tagDigestsByKey, expectedBlock.protectedTagNameKey, scenarioId);
    const blockedDigest = _requireTagDigest(tagDigestsByKey, expectedBlock.blockedTagNameKey, scenarioId);
    const row = protectedRootBlocks.find(
      (candidate) => candidate.protected_digest === protectedDigest && candidate.blocked_digest === blockedDigest
    );
    assert.ok(
      row,
      `missing cleanup_protected_root_blocks row for protected '${protectedDigest}' and blocked '${blockedDigest}'`
    );
    assert.match(
      row.overlap_digest,
      /^sha256:/,
      `cleanup_protected_root_blocks overlap digest was not a sha256 digest in scenario '${scenarioId}'`
    );
  }
} catch (error) {
  const diagnosticContext = _buildDiagnosticContext(database, scenarioId, cleanupAuditAssertions, tagNames);
  console.error(JSON.stringify(diagnosticContext, null, 2));
  throw error;
}

process.stdout.write(`Verified cleanup audit assertions for scenario '${scenarioId}'.\n`);

function _requireTagDigest(tagDigestsByKey, tagNameKey, scenarioId) {
  const digest = tagDigestsByKey.get(tagNameKey);
  assert.ok(digest, `scenario '${scenarioId}' is missing tag '${tagNameKey}' for cleanup audit assertions`);
  return digest;
}

function _buildDiagnosticContext(database, scenarioId, cleanupAuditAssertions, tagNames) {
  const cleanupRun = database
    .prepare(
      `
        SELECT
          cleanup_run_id,
          scan_id,
          direct_target_root_count AS directTargetRootCount,
          fully_deletable_root_count AS fullyDeletableRootCount,
          blocked_delete_root_count AS blockedDeleteRootCount,
          protected_root_count AS protectedRootCount
        FROM cleanup_runs
        ORDER BY cleanup_run_id DESC
        LIMIT 1
      `
    )
    .get();

  if (!cleanupRun) {
    return {
      scenarioId,
      expected: cleanupAuditAssertions,
      actual: {
        cleanupRun: null
      }
    };
  }

  const tagDigests = Object.fromEntries(
    Object.entries(tagNames).map(([tagNameKey, tag]) => {
      const row = database
        .prepare(
          `
            SELECT m.digest
            FROM tags t
            JOIN manifests m
              ON m.scan_id = t.scan_id
             AND m.version_id = t.version_id
            WHERE t.scan_id = ?
              AND t.tag = ?
          `
        )
        .get(cleanupRun.scan_id, tag);

      return [tagNameKey, { tag, digest: row?.digest ?? null }];
    })
  );

  return {
    scenarioId,
    expected: cleanupAuditAssertions,
    actual: {
      cleanupRun,
      tagDigests,
      rootDecisions: database
        .prepare(
          `
            SELECT digest, validation_status, blocking_digest
            FROM cleanup_root_decisions
            WHERE cleanup_run_id = ?
            ORDER BY digest
          `
        )
        .all(cleanupRun.cleanup_run_id),
      protectedRoots: database
        .prepare(
          `
            SELECT DISTINCT protected_digest AS digest
            FROM cleanup_protected_root_blocks
            WHERE cleanup_run_id = ?
            ORDER BY digest
          `
        )
        .all(cleanupRun.cleanup_run_id),
      protectedRootBlocks: database
        .prepare(
          `
            SELECT protected_digest, blocked_digest, overlap_digest
            FROM cleanup_protected_root_blocks
            WHERE cleanup_run_id = ?
            ORDER BY protected_digest, blocked_digest, overlap_digest
          `
        )
        .all(cleanupRun.cleanup_run_id)
    }
  };
}
