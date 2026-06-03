import assert from "node:assert/strict";
import test from "node:test";
import { untagRootTags } from "../../src/execute/index.js";

test("untagRootTags retargets tags and deletes the temporary package versions", async () => {
  const calls: Array<{ url: string; method?: string; body?: string }> = [];

  const detachedTagCount = await untagRootTags("acme", "example", 101, "sha256:source", ["latest"], {
    token: "test-token",
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {}
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
      calls.push({
        url,
        method: init?.method,
        body: typeof init?.body === "string" ? init.body : undefined
      });

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
      if (url === "https://ghcr.io/v2/acme/example/manifests/sha256:source") {
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
        const detachedDigest = calls.find(
          (call) => call.url === "https://ghcr.io/v2/acme/example/manifests/latest"
        )?.body;
        const bodyDigest = detachedDigest ? `sha256:${await _sha256(detachedDigest)}` : "sha256:missing";
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return [
              {
                id: 202,
                name: bodyDigest,
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
      if (url === "https://api.github.test/orgs/acme/packages/container/example/versions/202") {
        return {
          ok: true,
          status: 204,
          headers: new Headers(),
          async json() {
            return {};
          }
        };
      }
      if (url === "https://api.github.com/orgs/acme/packages/container/example/versions/202") {
        return {
          ok: true,
          status: 204,
          headers: new Headers(),
          async json() {
            return {};
          }
        };
      }

      throw new Error(`unexpected fetch: ${url}`);
    }
  });

  assert.equal(detachedTagCount, 1);
});

async function _sha256(value: string): Promise<string> {
  const crypto = await import("node:crypto");
  return crypto.createHash("sha256").update(value).digest("hex");
}
