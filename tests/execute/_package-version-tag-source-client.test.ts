import assert from "node:assert/strict";
import test from "node:test";
import { listPackageVersionTagSources, listPresentPackageVersionIds } from "../../src/execute/index.js";

test("listPackageVersionTagSources resolves requested tags to source versions and digests", async () => {
  const matches = await listPackageVersionTagSources(
    "acme",
    "example",
    ["keep-me", "latest", "missing"],
    "token",
    {
      debug() {},
      info() {},
      warn() {},
      error() {}
    },
    {
      fetchImpl: async (input) => {
        if (input === "https://api.github.com/users/acme") {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            async json() {
              return { type: "Organization" };
            }
          };
        }

        const url = String(input);
        if (url.endsWith("page=1")) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            async json() {
              return [
                {
                  id: 101,
                  name: "sha256:root-a",
                  metadata: {
                    container: {
                      tags: ["keep-me"]
                    }
                  }
                },
                {
                  id: 102,
                  name: "sha256:root-b",
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

        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return [];
          }
        };
      }
    }
  );

  assert.deepEqual(matches, [
    {
      tag: "keep-me",
      sourceVersionId: 101,
      sourceDigest: "sha256:root-a"
    },
    {
      tag: "latest",
      sourceVersionId: 102,
      sourceDigest: "sha256:root-b"
    }
  ]);
});

test("listPresentPackageVersionIds returns the subset of requested version ids still visible", async () => {
  const visibleVersionIds = await listPresentPackageVersionIds(
    "acme",
    "example",
    [101, 202, 303],
    "token",
    {
      debug() {},
      info() {},
      warn() {},
      error() {}
    },
    {
      fetchImpl: async (input) => {
        if (input === "https://api.github.com/users/acme") {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            async json() {
              return { type: "Organization" };
            }
          };
        }

        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          async json() {
            return [
              { id: 101, name: "sha256:root-a", metadata: { container: { tags: ["keep-me"] } } },
              { id: 303, name: "sha256:root-c", metadata: { container: { tags: [] } } }
            ];
          }
        };
      }
    }
  );

  assert.deepEqual(visibleVersionIds, [101, 303]);
});

test("listPresentPackageVersionIds returns early for empty requested ids", async () => {
  let fetchCalls = 0;

  const visibleVersionIds = await listPresentPackageVersionIds(
    "acme",
    "example",
    [],
    "token",
    {
      debug() {},
      info() {},
      warn() {},
      error() {}
    },
    {
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("fetch should not be called");
      }
    }
  );

  assert.deepEqual(visibleVersionIds, []);
  assert.equal(fetchCalls, 0);
});

test("listPackageVersionTagSources skips invalid metadata rows and stops on an empty page", async () => {
  const matches = await listPackageVersionTagSources(
    "acme",
    "example",
    ["keep-me", "latest", "dup"],
    "token",
    {
      debug() {},
      info() {},
      warn() {},
      error() {}
    },
    {
      fetchImpl: async (input) => {
        if (input === "https://api.github.com/users/acme") {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            async json() {
              return { type: "Organization" };
            }
          };
        }

        const url = String(input);
        if (url.endsWith("page=1")) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            async json() {
              return [
                {
                  id: 1,
                  name: "sha256:root-a",
                  metadata: {
                    container: {
                      tags: ["keep-me", "dup"]
                    }
                  }
                },
                {
                  id: 2,
                  name: 42,
                  metadata: {
                    container: {
                      tags: ["latest"]
                    }
                  }
                },
                {
                  id: 3,
                  name: "sha256:root-b",
                  metadata: {}
                }
              ];
            }
          };
        }

        if (url.endsWith("page=2")) {
          return {
            ok: true,
            status: 200,
            headers: new Headers({ "content-type": "application/json" }),
            async json() {
              return [];
            }
          };
        }

        throw new Error(`unexpected url ${url}`);
      }
    }
  );

  assert.deepEqual(matches, [
    {
      tag: "keep-me",
      sourceVersionId: 1,
      sourceDigest: "sha256:root-a"
    },
    {
      tag: "dup",
      sourceVersionId: 1,
      sourceDigest: "sha256:root-a"
    }
  ]);
});

test("listPackageVersionTagSources returns early for empty requested tags", async () => {
  let fetchCalls = 0;

  const matches = await listPackageVersionTagSources(
    "acme",
    "example",
    [],
    "token",
    {
      debug() {},
      info() {},
      warn() {},
      error() {}
    },
    {
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("fetch should not be called");
      }
    }
  );

  assert.deepEqual(matches, []);
  assert.equal(fetchCalls, 0);
});
