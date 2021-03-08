import { ExpoConfig, getConfig } from '@expo/config';
import { AndroidBuildProfile, EasConfig, iOSBuildProfile } from '@expo/eas-json';
import { v4 as uuidv4 } from 'uuid';

import Analytics, { Event } from './utils/analytics';
import { findAccountByName } from '../user/Account';
import { getProjectAccountName } from '../project/projectUtils';
import { Actor } from '../user/User';
import { ensureLoggedInAsync } from '../user/actions';
import { Platform, RequestedPlatform, TrackingContext } from './types';

export interface CommandContext {
  requestedPlatform: RequestedPlatform;
  profile: string;
  projectDir: string;
  projectId: string;
  user: Actor;
  accountName: string;
  projectName: string;
  exp: ExpoConfig;
  nonInteractive: boolean;
  skipCredentialsCheck: boolean;
  skipProjectConfiguration: boolean;
  waitForBuildEnd: boolean;
}

export async function createCommandContextAsync({
  requestedPlatform,
  profile,
  projectDir,
  projectId,
  nonInteractive = false,
  skipCredentialsCheck = false,
  skipProjectConfiguration = false,
  waitForBuildEnd,
}: {
  requestedPlatform: RequestedPlatform;
  profile: string;
  projectId: string;
  projectDir: string;
  nonInteractive: boolean;
  skipCredentialsCheck: boolean;
  skipProjectConfiguration: boolean;
  waitForBuildEnd: boolean;
}): Promise<CommandContext> {
  const user = await ensureLoggedInAsync();
  const { exp } = getConfig(projectDir, { skipSDKVersionRequirement: true });
  const accountName = getProjectAccountName(exp, user);
  const projectName = exp.slug;

  return {
    requestedPlatform,
    profile,
    projectDir,
    projectId,
    user,
    accountName,
    projectName,
    exp,
    nonInteractive,
    skipCredentialsCheck,
    skipProjectConfiguration,
    waitForBuildEnd,
  };
}

export interface ConfigureContext {
  user: Actor;
  projectDir: string;
  exp: ExpoConfig;
  allowExperimental: boolean;
  requestedPlatform: RequestedPlatform;
  shouldConfigureAndroid: boolean;
  shouldConfigureIos: boolean;
  hasAndroidNativeProject: boolean;
  hasIosNativeProject: boolean;
}

type PlatformBuildProfile<T extends Platform> = T extends Platform.ANDROID
  ? AndroidBuildProfile
  : iOSBuildProfile;

export interface BuildContext<T extends Platform> {
  commandCtx: CommandContext;
  trackingCtx: TrackingContext;
  platform: T;
  buildProfile: PlatformBuildProfile<T>;
}

export function createBuildContext<T extends Platform>({
  platform,
  easConfig,
  commandCtx,
}: {
  platform: T;
  easConfig: EasConfig;
  commandCtx: CommandContext;
}): BuildContext<T> {
  const buildProfile = easConfig.builds[platform] as PlatformBuildProfile<T> | undefined;
  if (!buildProfile) {
    throw new Error(`${platform} build profile does not exist`);
  }

  const accountId = findAccountByName(commandCtx.user.accounts, commandCtx.accountName)?.id;
  const trackingCtx = {
    tracking_id: uuidv4(),
    platform,
    ...(accountId && { account_id: accountId }),
    account_name: commandCtx.accountName,
    project_id: commandCtx.projectId,
    project_type: buildProfile.workflow,
  };
  Analytics.logEvent(Event.BUILD_COMMAND, trackingCtx);
  return {
    commandCtx,
    trackingCtx,
    platform,
    buildProfile,
  };
}
