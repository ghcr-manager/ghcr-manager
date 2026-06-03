export const ManifestKinds = {
  indexManifest: "index_manifest",
  multiArchManifest: "multi_arch_manifest",
  imageManifest: "image_manifest",
  artifactManifest: "artifact_manifest",
  attestationManifest: "attestation_manifest",
  signatureManifest: "signature_manifest"
} as const;

export type ManifestKind = (typeof ManifestKinds)[keyof typeof ManifestKinds];

export type ManifestEdgeKind = "image-child" | "referrer" | "digest-tag-referrer";

export interface PackageVersionRecord {
  versionId: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface TagRecord {
  tag: string;
  versionId: number;
}

export interface ManifestRecord {
  versionId: number;
  digest: string;
  mediaType: string;
  artifactType?: string;
  configMediaType?: string;
  subjectDigest?: string;
  annotations?: Record<string, unknown>;
  manifestKind?: ManifestKind;
}

export interface ManifestDescriptorRecord {
  parentDigest: string;
  childDigest: string;
  mediaType: string;
  artifactType?: string;
  platform?: {
    architecture?: string;
    os?: string;
    variant?: string;
  };
}

export interface ManifestEdgeRecord {
  parentDigest: string;
  childDigest: string;
  edgeKind: ManifestEdgeKind;
}

export interface PackageSnapshot {
  packageName: string;
  scanCompletedAt: string;
  packageVersions: PackageVersionRecord[];
  tags: TagRecord[];
  manifests: ManifestRecord[];
  manifestEdges: ManifestEdgeRecord[];
}
