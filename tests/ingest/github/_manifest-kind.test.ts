import assert from "node:assert/strict";
import test from "node:test";
import { ManifestKinds } from "../../../src/core/index.js";
import { classifyManifestKind } from "../../../src/ingest/github/_manifest-kind.js";

test("classifyManifestKind identifies single-platform image indexes as generic indexes", () => {
  assert.equal(
    classifyManifestKind({
      mediaType: "application/vnd.oci.image.index.v1+json",
      manifests: [
        {
          platform: {
            os: "linux",
            architecture: "amd64"
          }
        },
        {
          platform: {
            os: "unknown",
            architecture: "unknown"
          }
        }
      ]
    }),
    ManifestKinds.indexManifest
  );
});

test("classifyManifestKind identifies multi-platform indexes as multi-arch manifests", () => {
  assert.equal(
    classifyManifestKind({
      mediaType: "application/vnd.docker.distribution.manifest.list.v2+json",
      manifests: [
        {
          platform: {
            os: "linux",
            architecture: "amd64"
          }
        },
        {
          platform: {
            os: "linux",
            architecture: "arm64"
          }
        }
      ]
    }),
    ManifestKinds.multiArchManifest
  );
});

test("classifyManifestKind identifies OCI image manifests", () => {
  assert.equal(
    classifyManifestKind({ mediaType: "application/vnd.oci.image.manifest.v1+json" }),
    ManifestKinds.imageManifest
  );
});

test("classifyManifestKind identifies Docker schema2 image manifests", () => {
  assert.equal(
    classifyManifestKind({ mediaType: "application/vnd.docker.distribution.manifest.v2+json" }),
    ManifestKinds.imageManifest
  );
});

test("classifyManifestKind identifies sigstore signature manifests", () => {
  assert.equal(
    classifyManifestKind({
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      artifactType: "application/vnd.dev.sigstore.bundle.v0.3+json",
      subject: { digest: "sha256:subject" }
    }),
    ManifestKinds.signatureManifest
  );
});

test("classifyManifestKind identifies sigstore signatures from config media type", () => {
  assert.equal(
    classifyManifestKind({
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      config: {
        mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json"
      }
    }),
    ManifestKinds.signatureManifest
  );
});

test("classifyManifestKind identifies sigstore signatures from exact signature predicate annotation", () => {
  assert.equal(
    classifyManifestKind({
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      annotations: {
        "dev.sigstore.bundle.predicateType": "https://sigstore.dev/cosign/sign/v1"
      }
    }),
    ManifestKinds.signatureManifest
  );
});

test("classifyManifestKind identifies in-toto attestations stored as image manifests", () => {
  assert.equal(
    classifyManifestKind({
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      layers: [
        {
          mediaType: "application/vnd.in-toto+json",
          annotations: {
            "in-toto.io/predicate-type": "https://slsa.dev/provenance/v1"
          }
        }
      ]
    }),
    ManifestKinds.attestationManifest
  );
});

test("classifyManifestKind identifies attestations from docker reference type annotation", () => {
  assert.equal(
    classifyManifestKind({
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      annotations: {
        "vnd.docker.reference.type": "attestation-manifest"
      }
    }),
    ManifestKinds.attestationManifest
  );
});

test("classifyManifestKind identifies attestations from non-signature sigstore predicate annotation", () => {
  assert.equal(
    classifyManifestKind({
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      annotations: {
        "dev.sigstore.bundle.predicateType": "https://slsa.dev/provenance/v1"
      }
    }),
    ManifestKinds.attestationManifest
  );
});

test("classifyManifestKind falls back to artifact manifests", () => {
  assert.equal(
    classifyManifestKind({
      mediaType: "application/vnd.oci.artifact.manifest.v1+json"
    }),
    ManifestKinds.artifactManifest
  );
});

test("classifyManifestKind does not treat non-attestation docker reference type as attestation", () => {
  assert.equal(
    classifyManifestKind({
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      annotations: {
        "vnd.docker.reference.type": "not-attestation"
      }
    }),
    ManifestKinds.imageManifest
  );
});

test("classifyManifestKind returns undefined when no known category matches", () => {
  assert.equal(
    classifyManifestKind({
      mediaType: "application/example.manifest.v1+json"
    }),
    undefined
  );
});
