import type Database from "better-sqlite3";

interface _DigestRow {
  digest: string;
}

interface _ManifestEdgeRow {
  parent_digest: string;
  child_digest: string;
}

export function rebuildManifestReachability(database: Database.Database, scanId: number): void {
  _refreshDigestTagEdges(database, scanId);
  const manifestDigests = _loadManifestDigests(database, scanId);
  const childDigestsByParent = new Map<string, Set<string>>();
  const parentDigestsByChild = new Map<string, Set<string>>();
  const neighborDigestsByDigest = new Map<string, Set<string>>();

  for (const digest of manifestDigests) {
    childDigestsByParent.set(digest, new Set());
    parentDigestsByChild.set(digest, new Set());
    neighborDigestsByDigest.set(digest, new Set());
  }

  for (const manifestEdge of _loadManifestEdges(database, scanId)) {
    childDigestsByParent.get(manifestEdge.parent_digest)?.add(manifestEdge.child_digest);
    parentDigestsByChild.get(manifestEdge.child_digest)?.add(manifestEdge.parent_digest);
    neighborDigestsByDigest.get(manifestEdge.parent_digest)?.add(manifestEdge.child_digest);
    neighborDigestsByDigest.get(manifestEdge.child_digest)?.add(manifestEdge.parent_digest);
  }

  const graphIdsByDigest = _buildGraphIdsByDigest(manifestDigests, neighborDigestsByDigest);

  const remainingChildrenCount = new Map<string, number>();
  const descendantDistancesByDigest = new Map<string, Map<string, number>>();
  const readyDigests: string[] = [];

  for (const digest of manifestDigests) {
    const childCount = childDigestsByParent.get(digest)?.size ?? 0;
    remainingChildrenCount.set(digest, childCount);
    if (childCount === 0) {
      readyDigests.push(digest);
    }
  }

  while (readyDigests.length > 0) {
    const digest = readyDigests.shift();
    if (!digest) {
      continue;
    }

    const distances = new Map<string, number>([[digest, 0]]);
    for (const childDigest of childDigestsByParent.get(digest) ?? []) {
      _setMinDistance(distances, childDigest, 1);

      const childDistances = descendantDistancesByDigest.get(childDigest);
      if (!childDistances) {
        throw new Error(`manifest reachability build missing child results for ${childDigest}`);
      }

      for (const [descendantDigest, childDistance] of childDistances) {
        if (descendantDigest === childDigest) {
          continue;
        }

        _setMinDistance(distances, descendantDigest, childDistance + 1);
      }
    }

    descendantDistancesByDigest.set(digest, distances);
    for (const parentDigest of parentDigestsByChild.get(digest) ?? []) {
      const nextCount = (remainingChildrenCount.get(parentDigest) ?? 0) - 1;
      remainingChildrenCount.set(parentDigest, nextCount);
      if (nextCount === 0) {
        readyDigests.push(parentDigest);
      }
    }
  }

  if (descendantDistancesByDigest.size !== manifestDigests.length) {
    throw new Error("manifest reachability build detected a cycle in manifest_edges");
  }

  const insertRow = database.prepare(
    `
      INSERT OR REPLACE INTO manifest_reachability(
        scan_id,
        ancestor_digest,
        descendant_digest,
        min_distance
      )
      VALUES(?, ?, ?, ?)
    `
  );
  const insertGraphRow = database.prepare(
    `
      INSERT OR REPLACE INTO manifest_graphs(
        scan_id,
        digest,
        graph_id
      )
      VALUES(?, ?, ?)
    `
  );

  const rebuild = database.transaction(() => {
    database.prepare("DELETE FROM manifest_reachability WHERE scan_id = ?").run(scanId);
    database.prepare("DELETE FROM manifest_graphs WHERE scan_id = ?").run(scanId);

    for (const digest of manifestDigests) {
      insertGraphRow.run(scanId, digest, graphIdsByDigest.get(digest));

      for (const [descendantDigest, distance] of descendantDistancesByDigest.get(digest) ?? []) {
        insertRow.run(scanId, digest, descendantDigest, distance);
      }
    }
  });

  rebuild();
}

function _buildGraphIdsByDigest(
  manifestDigests: string[],
  neighborDigestsByDigest: Map<string, Set<string>>
): Map<string, number> {
  const graphIdsByDigest = new Map<string, number>();
  let nextGraphId = 1;

  for (const rootDigest of manifestDigests) {
    if (graphIdsByDigest.has(rootDigest)) {
      continue;
    }

    const pendingDigests = [rootDigest];
    graphIdsByDigest.set(rootDigest, nextGraphId);

    while (pendingDigests.length > 0) {
      const digest = pendingDigests.pop();
      if (!digest) {
        continue;
      }

      for (const neighborDigest of neighborDigestsByDigest.get(digest) ?? []) {
        if (graphIdsByDigest.has(neighborDigest)) {
          continue;
        }

        graphIdsByDigest.set(neighborDigest, nextGraphId);
        pendingDigests.push(neighborDigest);
      }
    }

    nextGraphId += 1;
  }

  return graphIdsByDigest;
}

function _refreshDigestTagEdges(database: Database.Database, scanId: number): void {
  database.prepare("DELETE FROM manifest_edges WHERE scan_id = ? AND edge_kind = 'digest-tag-referrer'").run(scanId);

  database
    .prepare(
      `
        INSERT OR IGNORE INTO manifest_edges(scan_id, parent_digest, child_digest, edge_kind)
        SELECT
          t.scan_id,
          m.digest AS parent_digest,
          'sha256:' || SUBSTR(t.tag, 8, 64) AS child_digest,
          'digest-tag-referrer' AS edge_kind
        FROM tags t
        JOIN manifests m
          ON m.scan_id = t.scan_id
         AND m.version_id = t.version_id
        JOIN manifests child_manifest
          ON child_manifest.scan_id = t.scan_id
         AND child_manifest.digest = 'sha256:' || SUBSTR(t.tag, 8, 64)
        WHERE t.scan_id = ?
          AND t.is_digest_tag = 1
      `
    )
    .run(scanId);
}

function _loadManifestDigests(database: Database.Database, scanId: number): string[] {
  const rows = database
    .prepare("SELECT digest FROM manifests WHERE scan_id = ? ORDER BY digest")
    .all(scanId) as _DigestRow[];
  return rows.map((row) => row.digest);
}

function _loadManifestEdges(database: Database.Database, scanId: number): _ManifestEdgeRow[] {
  return database
    .prepare(
      `
        SELECT DISTINCT parent_digest, child_digest
        FROM manifest_edges
        WHERE scan_id = ?
        ORDER BY parent_digest, child_digest
      `
    )
    .all(scanId) as _ManifestEdgeRow[];
}

function _setMinDistance(distances: Map<string, number>, digest: string, distance: number): void {
  const currentDistance = distances.get(digest);
  if (currentDistance === undefined || distance < currentDistance) {
    distances.set(digest, distance);
  }
}
