export type GraphEdgeKind = "image-child" | "referrer" | "digest-tag-referrer";

export interface GraphNode {
  id: string;
  digest: string;
  versionId: number;
  manifestKind: string | null;
  mediaType: string;
  displayPlatform: string | null;
  artifactType: string | null;
  subjectDigest: string | null;
  tags: string[];
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
  centerDigest: string;
  depth: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ManifestResolution {
  owner: string;
  packageName: string;
  scanId: number;
  digest: string;
  versionId: number;
  manifestKind: string | null;
  tags: string[];
}

export interface ManifestDetails extends GraphNode {
  rawJson: string | null;
}
