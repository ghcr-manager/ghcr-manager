import { buildDetachedManifestClone } from "./_manifest-detach.js";
import { findPackageVersionByDigestAndTag } from "./_package-version-page-client.js";
import { deletePackageVersion } from "./_package-version-delete-client.js";
import { loadRegistryManifestByDigest, putRegistryManifestForTag } from "./_registry-manifest-client.js";
import { loadRegistryPushToken } from "./_registry-token-client.js";
import type { DeleteExecutionOptions } from "./_types.js";

export async function untagRootTags(
  owner: string,
  packageName: string,
  sourceVersionId: number,
  sourceDigest: string,
  tags: string[],
  options: DeleteExecutionOptions
): Promise<number> {
  const registryToken = await loadRegistryPushToken(owner, packageName, options.token, options.logger, {
    fetchImpl: options.fetchImpl
  });
  const sourceManifest = await loadRegistryManifestByDigest(
    owner,
    packageName,
    sourceDigest,
    registryToken,
    options.logger,
    {
      fetchImpl: options.fetchImpl
    }
  );

  for (const tag of tags) {
    options.logger.info(`Detaching tag ${owner}/${packageName}:${tag} from ${sourceDigest}`);
    const detachedManifestJson = buildDetachedManifestClone(sourceManifest.rawJson, sourceManifest.mediaType, {
      detachedTag: tag,
      sourceDigest
    });
    const detachedDigest = await putRegistryManifestForTag(
      owner,
      packageName,
      tag,
      sourceManifest.mediaType,
      detachedManifestJson,
      registryToken,
      options.logger,
      {
        fetchImpl: options.fetchImpl
      }
    );
    const detachedVersionId = await findPackageVersionByDigestAndTag(
      owner,
      packageName,
      detachedDigest,
      tag,
      options.token,
      options.logger,
      {
        fetchImpl: options.fetchImpl
      }
    );
    await deletePackageVersion(owner, packageName, detachedVersionId, options.token, options.logger, {
      fetchImpl: options.fetchImpl
    });
  }

  return tags.length;
}
