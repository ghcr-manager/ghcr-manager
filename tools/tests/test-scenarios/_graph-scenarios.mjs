export const graphScenarios = {};

for (const [baseCase, extension] of [
  ["1image", "base"],
  ["1image", "attestations"],
  ["1image", "cosign"],
  ["1image", "cosign-attestations"],
  ["2images", "base"],
  ["2images", "attestations"],
  ["2images", "cosign"],
  ["2images", "cosign-attestations"],
  ["2multiarch", "base"],
  ["2multiarch", "attestations"],
  ["2multiarch", "cosign"],
  ["2multiarch", "cosign-attestations"]
]) {
  const id = `graph-${baseCase}-${extension}`;
  graphScenarios[id] = {
    id,
    packageSuffix: `scenario--${id}`,
    seedStrategy: id,
    supportedExecutors: ["ghcr-manager"],
    includeInMatrix: false,
    includeInGraphMatrix: true,
    ghcrManagerArgs: ["--delete-tag", `${id}--does-not-exist`],
    dataaxiomInputs: {
      "delete-tags": `${id}--does-not-exist`
    }
  };
}
