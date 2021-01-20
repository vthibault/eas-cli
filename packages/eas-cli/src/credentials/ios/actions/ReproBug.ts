import { Action, CredentialsManager } from '../../CredentialsManager';
import { Context } from '../../context';
import { AppLookupParams } from '../api/GraphqlClient';
import { ProfileClass } from '../appstore/provisioningProfile';
import { selectProfilesAsync } from './new/DistributionCertificateUtils';

export class ReproBug implements Action {
  constructor(private app: AppLookupParams) {}

  async runAsync(manager: CredentialsManager, ctx: Context): Promise<void> {
    const profiles = await ctx.appStore.listProvisioningProfilesAsync(
      this.app.bundleIdentifier,
      ProfileClass.Adhoc
    );

    const profile = await selectProfilesAsync(profiles);
    if (!profile || !profile.provisioningProfileId) {
      throw new Error('no profile chosen');
    }

    await ctx.appStore.repairProfileAsync(profile.provisioningProfileId, this.app.bundleIdentifier);
  }
}
