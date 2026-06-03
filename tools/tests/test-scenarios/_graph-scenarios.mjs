const _graphTagNamesByBaseCase = {
  "1image": {
    imageA: "image-a",
    keepDummy: "keep-dummy"
  },
  "2images": {
    imageA: "image-a",
    imageB: "image-b",
    multiarch: "multiarch",
    keepDummy: "keep-dummy"
  },
  "2multiarch": {
    imageA: "image-a",
    imageB: "image-b",
    imageC: "image-c",
    multiarchA: "multiarch-a",
    multiarchB: "multiarch-b",
    keepDummy: "keep-dummy"
  },
  "2multiarch2tags": {
    imageA: "image-a",
    multiarchA: "multiarch-a",
    keepDummy: "keep-dummy"
  }
};

const _graphCountsByExtension = {
  base: {
    "1image": { manifestCount: 2, tagCount: 2 },
    "2images": { manifestCount: 4, tagCount: 4 },
    "2multiarch": { manifestCount: 6, tagCount: 6 }
  },
  attestations: {
    "1image": { manifestCount: 4, tagCount: 2 },
    "2images": { manifestCount: 8, tagCount: 4 },
    "2multiarch": { manifestCount: 12, tagCount: 6 }
  },
  cosign: {
    "1image": { manifestCount: 4, tagCount: 3 },
    "2images": { manifestCount: 10, tagCount: 7 },
    "2multiarch": { manifestCount: 16, tagCount: 11 }
  },
  "cosign-attestations": {
    "1image": { manifestCount: 6, tagCount: 3 },
    "2images": { manifestCount: 14, tagCount: 7 },
    "2multiarch": { manifestCount: 22, tagCount: 11 }
  }
};

const _cleanupOperationsByBaseCase = {
  "1image": [
    {
      idSuffix: "delete-image-a",
      deleteTagKeys: ["imageA"],
      presentTagNameKeys: ["keepDummy"],
      absentTagNameKeys: ["imageA"],
      counts: () => ({ manifestCount: 1, tagCount: 1 })
    }
  ],
  "2images": [
    {
      idSuffix: "delete-image-a",
      deleteTagKeys: ["imageA"],
      presentTagNameKeys: ["imageB", "multiarch", "keepDummy"],
      absentTagNameKeys: ["imageA"],
      counts: ({ startCounts, extension }) => ({
        manifestCount: startCounts.manifestCount - (_extensionUsesAttestationsWithoutCosign(extension) ? 1 : 0),
        tagCount: startCounts.tagCount - 1
      })
    },
    {
      idSuffix: "delete-multiarch",
      deleteTagKeys: ["multiarch"],
      presentTagNameKeys: ["imageA", "imageB", "keepDummy"],
      absentTagNameKeys: ["multiarch"],
      counts: ({ oneImageCounts }) => ({
        manifestCount: oneImageCounts.manifestCount * 2 - 1,
        tagCount: oneImageCounts.tagCount * 2 - 1
      })
    },
    {
      idSuffix: "delete-image-a-and-multiarch",
      deleteTagKeys: ["imageA", "multiarch"],
      presentTagNameKeys: ["imageB", "keepDummy"],
      absentTagNameKeys: ["imageA", "multiarch"],
      counts: ({ oneImageCounts }) => oneImageCounts
    }
  ],
  "2multiarch": [
    {
      idSuffix: "delete-image-a",
      deleteTagKeys: ["imageA"],
      presentTagNameKeys: ["imageB", "imageC", "multiarchA", "multiarchB", "keepDummy"],
      absentTagNameKeys: ["imageA"],
      counts: ({ startCounts, extension }) => ({
        manifestCount: startCounts.manifestCount - (_extensionUsesAttestationsWithoutCosign(extension) ? 1 : 0),
        tagCount: startCounts.tagCount - 1
      })
    },
    {
      idSuffix: "delete-multiarch-a",
      deleteTagKeys: ["multiarchA"],
      presentTagNameKeys: ["imageA", "imageB", "imageC", "multiarchB", "keepDummy"],
      absentTagNameKeys: ["multiarchA"],
      counts: ({ startCounts, extension }) => ({
        manifestCount: startCounts.manifestCount - (_extensionUsesCosign(extension) ? 3 : 1),
        tagCount: startCounts.tagCount - (_extensionUsesCosign(extension) ? 2 : 1)
      })
    },
    {
      idSuffix: "delete-image-a-and-multiarch-a",
      deleteTagKeys: ["imageA", "multiarchA"],
      presentTagNameKeys: ["imageB", "imageC", "multiarchB", "keepDummy"],
      absentTagNameKeys: ["imageA", "multiarchA"],
      counts: ({ twoImagesCounts }) => twoImagesCounts
    }
  ],
  "2multiarch2tags": [
    {
      idSuffix: "delete-multiarch-a",
      deleteTagKeys: ["multiarchA"],
      presentTagNameKeys: ["imageA", "keepDummy"],
      absentTagNameKeys: ["multiarchA"],
      counts: ({ oneImageCounts }) => oneImageCounts
    }
  ]
};

export const graphScenarios = {};

for (const [baseCase, extension] of _graphVariants()) {
  const seedStrategy = `graph-${baseCase}-${extension}`;
  graphScenarios[seedStrategy] = {
    id: seedStrategy,
    packageSuffix: `scenario--${seedStrategy}`,
    seedStrategy,
    supportedExecutors: ["ghcr-manager"],
    includeInMatrix: false,
    includeInGraphMatrix: false,
    ghcrManagerArgs: ["--delete-tag", "does-not-exist"],
    dataaxiomInputs: {
      "delete-tags": "does-not-exist"
    },
    tagNames: _graphTagNamesByBaseCase[baseCase]
  };

  for (const operation of _cleanupOperationsByBaseCase[baseCase]) {
    const id = `${seedStrategy}--${operation.idSuffix}`;
    const context = {
      extension,
      oneImageCounts: _graphCountsByExtension[extension]["1image"],
      twoImagesCounts: _graphCountsByExtension[extension]["2images"],
      startCounts: _graphCountsByExtension[extension][baseCase]
    };

    graphScenarios[id] = {
      id,
      packageSuffix: `scenario--${id}`,
      seedStrategy,
      supportedExecutors: ["ghcr-manager", "ghcr-cleanup-action"],
      includeInMatrix: false,
      includeInGraphMatrix: true,
      ghcrManagerArgs: _buildDeleteTagArgs(operation.deleteTagKeys),
      dataaxiomInputs: {
        "delete-tags": _buildDeleteTagInput(operation.deleteTagKeys)
      },
      tagNames: _graphTagNamesByBaseCase[baseCase],
      scanAssertions: operation.presentTagNameKeys.map((tagNameKey) => ({ tagNameKey })),
      latestScanAssertions: {
        ...operation.counts(context),
        absentTagNameKeys: operation.absentTagNameKeys
      }
    };
  }
}

function* _graphVariants() {
  for (const baseCase of ["1image", "2images", "2multiarch", "2multiarch2tags"]) {
    for (const extension of ["base", "attestations", "cosign", "cosign-attestations"]) {
      yield [baseCase, extension];
    }
  }
}

function _buildDeleteTagArgs(tagKeys) {
  return tagKeys.flatMap((tagKey) => ["--delete-tag", `{${tagKey}}`]);
}

function _buildDeleteTagInput(tagKeys) {
  return tagKeys.map((tagKey) => `{${tagKey}}`).join(",");
}

function _extensionUsesCosign(extension) {
  return extension === "cosign" || extension === "cosign-attestations";
}

function _extensionUsesAttestationsWithoutCosign(extension) {
  return extension === "attestations";
}
