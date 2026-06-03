export const cleanupScenarios = {
  "delete-untagged-noop": {
    id: "delete-untagged-noop",
    packageSuffix: "scenario--delete-untagged-noop",
    seedStrategy: "delete-untagged-noop",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-untagged"],
    dataaxiomInputs: {
      "delete-untagged": "true"
    }
  },
  "tagged-fully-deletable": {
    id: "tagged-fully-deletable",
    packageSuffix: "scenario--tagged-fully-deletable",
    seedStrategy: "tagged-fully-deletable",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-tag", "{deleteTag}"],
    dataaxiomInputs: {
      "delete-tags": "{deleteTag}"
    },
    tagNames: {
      deleteTag: "delete-me"
    },
    cleanupAuditAssertions: {
      validationSummary: {
        directTargetRootCount: 1,
        fullyDeletableRootCount: 1,
        blockedDeleteRootCount: 0,
        protectedRootCount: 0
      },
      rootDecisions: [{ tagNameKey: "deleteTag", validationStatus: "fully-deletable" }],
      protectedTagNameKeys: [],
      protectedRootBlocks: []
    }
  },
  "digest-fully-deletable": {
    id: "digest-fully-deletable",
    packageSuffix: "scenario--digest-fully-deletable",
    seedStrategy: "digest-fully-deletable",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-tag", "{deleteTag}"],
    dataaxiomInputs: {},
    digestSelectorTagNameKey: "deleteTag",
    tagNames: {
      deleteTag: "delete-me"
    },
    cleanupAuditAssertions: {
      validationSummary: {
        directTargetRootCount: 1,
        fullyDeletableRootCount: 1,
        blockedDeleteRootCount: 0,
        protectedRootCount: 0
      },
      rootDecisions: [{ tagNameKey: "deleteTag", validationStatus: "fully-deletable" }],
      protectedTagNameKeys: [],
      protectedRootBlocks: []
    }
  },
  "untag-only-single-shared-root": {
    id: "untag-only-single-shared-root",
    packageSuffix: "scenario--untag-only-single-shared-root",
    seedStrategy: "untag-only-single-shared-root",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-tag", "{deleteTag}"],
    dataaxiomInputs: {
      "delete-tags": "{deleteTag}"
    },
    tagNames: {
      deleteTag: "delete-me",
      keepTag: "keep-me"
    }
  },
  "untag-only-multiarch-shared-root": {
    id: "untag-only-multiarch-shared-root",
    packageSuffix: "scenario--untag-only-multiarch-shared-root",
    seedStrategy: "untag-only-multiarch-shared-root",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-tag", "{deleteTag}"],
    dataaxiomInputs: {
      "delete-tags": "{deleteTag}"
    },
    tagNames: {
      deleteTag: "delete-me",
      keepTag: "keep-me"
    }
  },
  "docker-manifest-list-untag-only-shared-root": {
    id: "docker-manifest-list-untag-only-shared-root",
    packageSuffix: "scenario--docker-manifest-list-untag-only-shared-root",
    seedStrategy: "docker-manifest-list-untag-only-shared-root",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-tag", "{deleteTag}"],
    dataaxiomInputs: {
      "delete-tags": "{deleteTag}"
    },
    tagNames: {
      deleteTag: "delete-me",
      keepTag: "keep-me"
    },
    scanAssertions: [
      {
        tagNameKey: "keepTag",
        expectedManifestKind: "multi_arch_manifest",
        expectedManifestMediaType: "application/vnd.docker.distribution.manifest.list.v2+json",
        requireRoot: true
      }
    ]
  },
  "cosign-referrer-kept-multiarch": {
    id: "cosign-referrer-kept-multiarch",
    packageSuffix: "scenario--cosign-referrer-kept-multiarch",
    seedStrategy: "cosign-referrer-kept-multiarch",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    includeInMatrix: false,
    ghcrManagerArgs: ["--delete-untagged"],
    dataaxiomInputs: {
      "delete-untagged": "true"
    },
    tagNames: {
      keepTag: "keep-me"
    },
    scanAssertions: [
      {
        tagNameKey: "keepTag",
        expectedManifestKind: "multi_arch_manifest",
        expectedManifestMediaType: "application/vnd.oci.image.index.v1+json",
        requireRoot: true
      }
    ],
    signatureSubjectAssertions: [
      {
        tagNameKey: "keepTag",
        requiredArtifactType: "application/vnd.dev.sigstore.bundle.v0.3+json",
        requiredSubjectManifestKind: "image_manifest",
        requireUntaggedRoots: true,
        minDistinctSubjectCount: 2,
        minSignatureRootCount: 2
      }
    ]
  },
  "cosign-referrer-kept-multiarch-index-signature": {
    id: "cosign-referrer-kept-multiarch-index-signature",
    packageSuffix: "scenario--cosign-referrer-kept-multiarch-index-signature",
    seedStrategy: "cosign-referrer-kept-multiarch-index-signature",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    includeInMatrix: false,
    ghcrManagerArgs: ["--delete-untagged"],
    dataaxiomInputs: {
      "delete-untagged": "true"
    },
    tagNames: {
      keepTag: "keep-me"
    },
    scanAssertions: [
      {
        tagNameKey: "keepTag",
        expectedManifestKind: "multi_arch_manifest",
        expectedManifestMediaType: "application/vnd.oci.image.index.v1+json",
        requireRoot: true
      }
    ],
    signatureSubjectAssertions: [
      {
        tagNameKey: "keepTag",
        requiredArtifactType: "application/vnd.dev.sigstore.bundle.v0.3+json",
        requiredSubjectManifestKind: "multi_arch_manifest",
        requireUntaggedRoots: true,
        minDistinctSubjectCount: 1,
        minSignatureRootCount: 1
      }
    ]
  },
  "blocked-shared-closure": {
    id: "blocked-shared-closure",
    packageSuffix: "scenario--blocked-shared-closure",
    seedStrategy: "blocked-shared-closure",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-tag", "{deleteTag}"],
    dataaxiomInputs: {
      "delete-tags": "{deleteTag}"
    },
    tagNames: {
      deleteTag: "delete-me",
      keepTag: "keep-me"
    },
    cleanupAuditAssertions: {
      validationSummary: {
        directTargetRootCount: 1,
        fullyDeletableRootCount: 1,
        blockedDeleteRootCount: 0
      },
      rootDecisions: [{ tagNameKey: "deleteTag", validationStatus: "fully-deletable" }],
      protectedTagNameKeys: [],
      protectedRootBlocks: []
    }
  },
  "delete-untagged-real": {
    id: "delete-untagged-real",
    packageSuffix: "scenario--delete-untagged-real",
    seedStrategy: "delete-untagged-real",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-untagged"],
    dataaxiomInputs: {
      "delete-untagged": "true"
    },
    tagNames: {
      trackedTag: "tracked"
    }
  },
  "exclude-tag-protected-root": {
    id: "exclude-tag-protected-root",
    packageSuffix: "scenario--exclude-tag-protected-root",
    seedStrategy: "exclude-tag-protected-root",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-tag", "{deleteTag}", "--exclude-tag", "{keepTag}"],
    dataaxiomInputs: {
      "delete-tags": "{deleteTag}",
      "exclude-tags": "{keepTag}"
    },
    tagNames: {
      deleteTag: "delete-me",
      keepTag: "keep-me"
    }
  },
  "keep-n-tagged-overflow": {
    id: "keep-n-tagged-overflow",
    packageSuffix: "scenario--keep-n-tagged-overflow",
    seedStrategy: "keep-n-tagged-overflow",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--keep-n-tagged", "1"],
    dataaxiomInputs: {
      "keep-n-tagged": "1"
    },
    tagNames: {
      oldestTag: "oldest",
      middleTag: "middle",
      newestTag: "newest"
    }
  },
  "keep-n-untagged-overflow": {
    id: "keep-n-untagged-overflow",
    packageSuffix: "scenario--keep-n-untagged-overflow",
    seedStrategy: "keep-n-untagged-overflow",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--keep-n-untagged", "1"],
    dataaxiomInputs: {
      "keep-n-untagged": "1"
    },
    tagNames: {
      trackedTag: "tracked"
    }
  },
  "delete-tags-keep-n-tagged-overflow": {
    id: "delete-tags-keep-n-tagged-overflow",
    packageSuffix: "scenario--delete-tags-keep-n-tagged-overflow",
    seedStrategy: "delete-tags-keep-n-tagged-overflow",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-tag", "{deleteOldTag}", "--delete-tag", "{deleteNewTag}", "--keep-n-tagged", "1"],
    dataaxiomInputs: {
      "delete-tags": "{deleteOldTag},{deleteNewTag}",
      "keep-n-tagged": "1"
    },
    tagNames: {
      deleteOldTag: "delete-old",
      deleteNewTag: "delete-new",
      keepTag: "keep"
    }
  },
  "delete-ghost-images-real": {
    id: "delete-ghost-images-real",
    packageSuffix: "scenario--delete-ghost-images-real",
    seedStrategy: "delete-ghost-images-real",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-ghost-images"],
    dataaxiomInputs: {
      "delete-ghost-images": "true"
    }
  },
  "delete-ghost-images-noop": {
    id: "delete-ghost-images-noop",
    packageSuffix: "scenario--delete-ghost-images-noop",
    seedStrategy: "delete-ghost-images-noop",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-ghost-images"],
    dataaxiomInputs: {
      "delete-ghost-images": "true"
    }
  },
  "delete-partial-images-real": {
    id: "delete-partial-images-real",
    packageSuffix: "scenario--delete-partial-images-real",
    seedStrategy: "delete-partial-images-real",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-partial-images"],
    dataaxiomInputs: {
      "delete-partial-images": "true"
    }
  },
  "delete-partial-images-noop": {
    id: "delete-partial-images-noop",
    packageSuffix: "scenario--delete-partial-images-noop",
    seedStrategy: "delete-partial-images-noop",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-partial-images"],
    dataaxiomInputs: {
      "delete-partial-images": "true"
    }
  },
  "delete-orphaned-images-real": {
    id: "delete-orphaned-images-real",
    packageSuffix: "scenario--delete-orphaned-images-real",
    seedStrategy: "delete-orphaned-images-real",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-orphaned-images"],
    dataaxiomInputs: {
      "delete-orphaned-images": "true"
    }
  },
  "delete-orphaned-images-noop": {
    id: "delete-orphaned-images-noop",
    packageSuffix: "scenario--delete-orphaned-images-noop",
    seedStrategy: "delete-orphaned-images-noop",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-orphaned-images"],
    dataaxiomInputs: {
      "delete-orphaned-images": "true"
    }
  },
  "wildcard-tagged-fully-deletable": {
    id: "wildcard-tagged-fully-deletable",
    packageSuffix: "scenario--wildcard-tagged-fully-deletable",
    seedStrategy: "wildcard-tagged-fully-deletable",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-tag", "*delete-me"],
    dataaxiomInputs: {
      "delete-tags": "*delete-me"
    }
  },
  "regex-untag-only-single-shared-root": {
    id: "regex-untag-only-single-shared-root",
    packageSuffix: "scenario--regex-untag-only-single-shared-root",
    seedStrategy: "untag-only-single-shared-root",
    supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
    ghcrManagerArgs: ["--delete-tag", "^delete-me$", "--use-regex"],
    dataaxiomInputs: {
      "delete-tags": "^delete-me$",
      "use-regex": "true"
    }
  }
};
