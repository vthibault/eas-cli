import { BundleId, Profile, RequestContext } from '@expo/apple-utils';

export async function getProfilesForBundleIdAsync(
  context: RequestContext,
  bundleIdentifier: string
): Promise<Profile[]> {
  const bundleId = await BundleId.findAsync(context, { identifier: bundleIdentifier });
  if (bundleId) {
    return bundleId.getProfilesAsync();
  }
  return [];
}

  await promptAsync({
    type: 'select',
    name: 'selected',
    message: `Did you delete a profile yet? ${profiles.map(profile => profile.id)}`,
    choices: [
      {
        title: 'Yes',
        value: 'Yes',
      },
    ],
  });
export async function getBundleIdForIdentifierAsync(
  context: RequestContext,
  bundleIdentifier: string
): Promise<BundleId> {
  const bundleId = await BundleId.findAsync(context, { identifier: bundleIdentifier });
  if (!bundleId) {
    throw new Error(`Failed to find Bundle ID item with identifier "${bundleIdentifier}"`);
  }
  return bundleId;
}
