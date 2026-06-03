export interface DirectTargetRootOptions {
  deleteTags: string[];
  deleteTagsRequested: boolean;
  deleteOrphanedImages?: boolean;
  excludeTags: string[];
  deleteUntagged: boolean;
  keepNTagged?: number;
  keepNUntagged?: number;
  useRegex?: boolean;
  cutoffTimestamp?: string;
}
