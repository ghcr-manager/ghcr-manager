export type GraphEdgeKind = "image-child" | "referrer" | "digest-tag-referrer";
export type ChangeStatus = "unchanged" | "added" | "removed";

export interface OwnerOption {
  owner: string;
}

export interface PackageOption {
  packageName: string;
}

export interface ScanOption {
  scanId: number;
  scanCompletedAt: string;
}

export interface TagOption {
  tagName: string;
}

export interface GraphTag {
  name: string;
  changeStatus: ChangeStatus;
}

export interface GraphNode {
  id: string;
  digest: string;
  versionId: number;
  createdAt: string;
  updatedAt: string;
  manifestKind: string | null;
  mediaType: string;
  displayPlatform: string | null;
  artifactType: string | null;
  subjectDigest: string | null;
  tags: GraphTag[];
  changeStatus: ChangeStatus;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: GraphEdgeKind;
}

export interface GraphResponse {
  owner: string;
  packageName: string;
  scanId: number;
  compareScanId?: number;
  centerDigest: string;
  depth: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ManifestResolution {
  owner: string;
  packageName: string;
  scanId: number;
  compareScanId?: number;
  digest: string;
  versionId: number;
  manifestKind: string | null;
  tags: string[];
}

export interface ManifestDetails extends GraphNode {
  rawJson: string | null;
}
