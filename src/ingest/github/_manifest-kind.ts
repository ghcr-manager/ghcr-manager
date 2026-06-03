import { ManifestKinds, type ManifestKind } from "../../core/index.js";

interface _RegistryLayer {
  mediaType?: string;
  annotations?: Record<string, unknown>;
}

interface _RegistryManifestDocument {
  mediaType?: string;
  artifactType?: string;
  annotations?: Record<string, unknown>;
  manifests?: Array<{
    platform?: {
      architecture?: string;
      os?: string;
    };
  }>;
  config?: {
    mediaType?: string;
    artifactType?: string;
  };
  layers?: _RegistryLayer[];
  subject?: {
    digest?: string;
  };
}

export function classifyManifestKind(document: _RegistryManifestDocument): ManifestKind | undefined {
  if (
    document.mediaType === "application/vnd.oci.image.index.v1+json" ||
    document.mediaType === "application/vnd.docker.distribution.manifest.list.v2+json"
  ) {
    return _isMultiArchManifest(document) ? ManifestKinds.multiArchManifest : ManifestKinds.indexManifest;
  }

  if (_isSignatureManifest(document)) {
    return ManifestKinds.signatureManifest;
  }

  if (_isAttestationManifest(document)) {
    return ManifestKinds.attestationManifest;
  }

  if (
    document.mediaType === "application/vnd.oci.image.manifest.v1+json" ||
    document.mediaType === "application/vnd.docker.distribution.manifest.v2+json"
  ) {
    return ManifestKinds.imageManifest;
  }

  if (document.mediaType === "application/vnd.oci.artifact.manifest.v1+json") {
    return ManifestKinds.artifactManifest;
  }

  return undefined;
}

function _isMultiArchManifest(document: _RegistryManifestDocument): boolean {
  const realPlatformDescriptorCount =
    document.manifests?.filter((descriptor) => {
      const architecture = descriptor.platform?.architecture;
      const os = descriptor.platform?.os;
      return (
        typeof architecture === "string" &&
        typeof os === "string" &&
        architecture.length > 0 &&
        os.length > 0 &&
        architecture !== "unknown" &&
        os !== "unknown"
      );
    }).length ?? 0;

  return realPlatformDescriptorCount > 1;
}

function _isSignatureManifest(document: _RegistryManifestDocument): boolean {
  const candidates = [
    document.artifactType,
    document.config?.artifactType,
    document.config?.mediaType,
    ...(document.layers?.map((layer) => layer.mediaType) ?? [])
  ];

  if (candidates.some((value) => typeof value === "string" && value.includes("application/vnd.dev.sigstore"))) {
    return true;
  }

  return (
    typeof document.annotations?.["dev.sigstore.bundle.predicateType"] === "string" &&
    document.annotations["dev.sigstore.bundle.predicateType"] === "https://sigstore.dev/cosign/sign/v1"
  );
}

function _isAttestationManifest(document: _RegistryManifestDocument): boolean {
  const candidates = [
    document.artifactType,
    document.config?.artifactType,
    document.config?.mediaType,
    ...(document.layers?.map((layer) => layer.mediaType) ?? [])
  ];

  if (candidates.some((value) => typeof value === "string" && value.includes("application/vnd.in-toto"))) {
    return true;
  }

  if (typeof document.annotations?.["vnd.docker.reference.type"] === "string") {
    return document.annotations["vnd.docker.reference.type"] === "attestation-manifest";
  }

  if (typeof document.annotations?.["dev.sigstore.bundle.predicateType"] === "string") {
    return document.annotations["dev.sigstore.bundle.predicateType"] !== "https://sigstore.dev/cosign/sign/v1";
  }

  return (
    document.layers?.some((layer) => typeof layer.annotations?.["in-toto.io/predicate-type"] === "string") ?? false
  );
}
