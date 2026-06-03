import assert from "node:assert/strict";
import test from "node:test";
import { DeletePlanValidationReasonCodes, DeletePlanValidationStatuses, type DeletePlan } from "../../src/db/index.js";
import { executeDeletePlan } from "../../src/execute/index.js";

test("executeDeletePlan deletes fully deletable roots and returns a summary", async () => {
  const deletedVersionIds: number[] = [];
  const plan: DeletePlan = {
    owner: "acme",
    packageName: "example",
    scanCompletedAt: "2026-05-15T00:00:00.000Z",
    plannerInputs: {
      deleteUntagged: true,
      deleteTags: [],
      excludeTags: []
    },
    directTargetTags: [],
    directTargetRoots: [
      {
        versionId: 104,
        digest: "sha256:untagged-old",
        reason: "delete-untagged",
        selectionMode: "delete-root"
      }
    ],
    rootDecisions: [
      {
        versionId: 104,
        digest: "sha256:untagged-old",
        selectionMode: "delete-root",
        selectionReason: "delete-untagged",
        validationStatus: DeletePlanValidationStatuses.fullyDeletable,
        validationReasonCode: DeletePlanValidationReasonCodes.fullyDeletableNoRetainedOverlap,
        validationReason: "root closure does not overlap any retained root"
      }
    ],
    protectedRoots: [],
    closureManifests: [
      {
        sourceVersionId: 104,
        sourceDigest: "sha256:untagged-old",
        memberVersionId: 204,
        memberDigest: "sha256:descendant-child",
        memberManifestKind: "image_manifest",
        hopsFromRoot: 1,
        memberRole: "descendant"
      },
      {
        sourceVersionId: 104,
        sourceDigest: "sha256:untagged-old",
        memberVersionId: 304,
        memberDigest: "sha256:descendant-referrer",
        memberManifestKind: "artifact_manifest",
        hopsFromRoot: 2,
        memberRole: "descendant"
      },
      {
        sourceVersionId: 104,
        sourceDigest: "sha256:untagged-old",
        memberVersionId: 104,
        memberDigest: "sha256:untagged-old",
        memberManifestKind: "image_manifest",
        hopsFromRoot: 0,
        memberRole: "root"
      }
    ],
    blockedRoots: [],
    fullyDeletableRoots: [
      {
        versionId: 104,
        digest: "sha256:untagged-old",
        reason: "delete-untagged",
        selectionMode: "delete-root"
      }
    ],
    collateralTags: []
  };

  const summary = await executeDeletePlan(plan, {
    token: "token",
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {}
    },
    fetchImpl: async (input) => {
      if (String(input) === "https://api.github.com/users/acme") {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          async json() {
            return { type: "Organization" };
          }
        };
      }
      deletedVersionIds.push(Number(String(input).split("/").pop()));
      return {
        ok: true,
        status: 204,
        headers: new Headers(),
        async json() {
          return {};
        }
      };
    }
  });

  assert.deepEqual(deletedVersionIds, [304, 204, 104]);
  assert.equal(summary.deletedPackageVersionCount, 3);
  assert.equal(summary.detachedTagCount, 0);
});

test("executeDeletePlan applies untag-only roots before deleting fully deletable roots", async () => {
  const plan: DeletePlan = {
    owner: "acme",
    packageName: "example",
    scanCompletedAt: "2026-05-15T00:00:00.000Z",
    plannerInputs: {
      deleteUntagged: false,
      deleteTags: ["latest"],
      excludeTags: []
    },
    directTargetTags: ["latest"],
    directTargetRoots: [
      {
        versionId: 101,
        digest: "sha256:index-current",
        reason: "delete-tags-partial-tag-match",
        selectionMode: "untag-only"
      }
    ],
    rootDecisions: [
      {
        versionId: 101,
        digest: "sha256:index-current",
        selectionMode: "untag-only",
        selectionReason: "delete-tags-partial-tag-match",
        validationStatus: DeletePlanValidationStatuses.untagOnly,
        validationReasonCode: DeletePlanValidationReasonCodes.untagOnlyPartialTagMatch,
        validationReason: "selected tags do not cover every tag on the root"
      }
    ],
    protectedRoots: [],
    closureManifests: [],
    blockedRoots: [],
    fullyDeletableRoots: [],
    collateralTags: []
  };

  const fetchCalls: Array<{ url: string; method?: string }> = [];
  let detachedDigest = "sha256:detached";
  let latestVisible = true;
  const summary = await executeDeletePlan(plan, {
    token: "token",
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {}
    },
    listRootTags() {
      return ["keep-me", "latest"];
    },
    fetchImpl: async (input, init) => {
      const url = String(input);
      if (url === "https://api.github.com/users/acme") {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          async json() {
            return { type: "Organization" };
          }
        };
      }
      fetchCalls.push({ url, method: init?.method });

      if (url.startsWith("https://ghcr.io/token")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return { token: "registry-token" };
          }
        };
      }
      if (url === "https://ghcr.io/v2/acme/example/manifests/sha256:index-current") {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/vnd.oci.image.manifest.v1+json" }),
          async json() {
            return {
              schemaVersion: 2,
              mediaType: "application/vnd.oci.image.manifest.v1+json",
              config: { mediaType: "application/vnd.oci.image.config.v1+json", digest: "sha256:config", size: 1 },
              layers: []
            };
          }
        };
      }
      if (url === "https://ghcr.io/v2/acme/example/manifests/latest") {
        const crypto = await import("node:crypto");
        detachedDigest = `sha256:${crypto
          .createHash("sha256")
          .update(String(init?.body ?? ""))
          .digest("hex")}`;
        return {
          ok: true,
          status: 201,
          headers: new Headers(),
          async json() {
            return {};
          }
        };
      }
      if (url === "https://api.github.com/orgs/acme/packages/container/example/versions?per_page=100&page=1") {
        if (!latestVisible) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            async json() {
              return [];
            }
          };
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return [
              {
                id: 303,
                name: detachedDigest,
                metadata: {
                  container: {
                    tags: ["latest"]
                  }
                }
              }
            ];
          }
        };
      }
      if (url === "https://api.github.com/orgs/acme/packages/container/example/versions/303") {
        latestVisible = false;
        return {
          ok: true,
          status: 204,
          headers: new Headers(),
          async json() {
            return {};
          }
        };
      }

      return {
        ok: true,
        status: 204,
        headers: new Headers(),
        async json() {
          return {};
        }
      };
    }
  });

  assert.equal(summary.deletedPackageVersionCount, 0);
  assert.equal(summary.detachedTagCount, 1);
  assert.equal(
    fetchCalls.some((call) => call.url === "https://ghcr.io/v2/acme/example/manifests/latest"),
    true
  );
});

test("executeDeletePlan rejects untag-only roots without listRootTags support", async () => {
  const plan: DeletePlan = {
    owner: "acme",
    packageName: "example",
    scanCompletedAt: "2026-05-15T00:00:00.000Z",
    plannerInputs: {
      deleteUntagged: false,
      deleteTags: ["latest"],
      excludeTags: []
    },
    directTargetTags: ["latest"],
    directTargetRoots: [
      {
        versionId: 101,
        digest: "sha256:index-current",
        reason: "delete-tags-partial-tag-match",
        selectionMode: "untag-only"
      }
    ],
    rootDecisions: [
      {
        versionId: 101,
        digest: "sha256:index-current",
        selectionMode: "untag-only",
        selectionReason: "delete-tags-partial-tag-match",
        validationStatus: DeletePlanValidationStatuses.untagOnly,
        validationReasonCode: DeletePlanValidationReasonCodes.untagOnlyPartialTagMatch,
        validationReason: "selected tags do not cover every tag on the root"
      }
    ],
    protectedRoots: [],
    closureManifests: [],
    blockedRoots: [],
    fullyDeletableRoots: [],
    collateralTags: []
  };

  await assert.rejects(
    () =>
      executeDeletePlan(plan, {
        token: "token",
        logger: {
          debug() {},
          info() {},
          warn() {},
          error() {}
        }
      }),
    /execution requires listRootTags support for untag-only root sha256:index-current/
  );
});

test("executeDeletePlan rejects untag-only roots when no selected tags resolve", async () => {
  const plan: DeletePlan = {
    owner: "acme",
    packageName: "example",
    scanCompletedAt: "2026-05-15T00:00:00.000Z",
    plannerInputs: {
      deleteUntagged: false,
      deleteTags: ["latest"],
      excludeTags: []
    },
    directTargetTags: ["latest"],
    directTargetRoots: [
      {
        versionId: 101,
        digest: "sha256:index-current",
        reason: "delete-tags-partial-tag-match",
        selectionMode: "untag-only"
      }
    ],
    rootDecisions: [
      {
        versionId: 101,
        digest: "sha256:index-current",
        selectionMode: "untag-only",
        selectionReason: "delete-tags-partial-tag-match",
        validationStatus: DeletePlanValidationStatuses.untagOnly,
        validationReasonCode: DeletePlanValidationReasonCodes.untagOnlyPartialTagMatch,
        validationReason: "selected tags do not cover every tag on the root"
      }
    ],
    protectedRoots: [],
    closureManifests: [],
    blockedRoots: [],
    fullyDeletableRoots: [],
    collateralTags: []
  };

  await assert.rejects(
    () =>
      executeDeletePlan(plan, {
        token: "token",
        logger: {
          debug() {},
          info() {},
          warn() {},
          error() {}
        },
        listRootTags() {
          return ["keep-me"];
        }
      }),
    /no selected tags resolved for untag-only root sha256:index-current/
  );
});
