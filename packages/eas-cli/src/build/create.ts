import { EasJsonReader } from '@expo/eas-json';
import chalk from 'chalk';
import ora from 'ora';

import { apiClient } from '../api';
import Log from '../log';
import { sleep } from '../utils/promise';
import { prepareAndroidBuildAsync } from './android/build';
import { CommandContext } from './context';
import { prepareIosBuildAsync } from './ios/build';
import { Build, BuildStatus, Platform, RequestedPlatform } from './types';
import { printBuildResults, printLogsUrls } from './utils/printBuildInfo';
import { ensureGitRepoExistsAsync, ensureGitStatusIsCleanAsync } from './utils/repository';

export async function buildAsync(commandCtx: CommandContext): Promise<void> {
  await ensureGitRepoExistsAsync();
  await ensureGitStatusIsCleanAsync(commandCtx.nonInteractive);

  const scheduledBuilds = await startBuildsAsync(commandCtx);
  Log.newLine();
  printLogsUrls(commandCtx.accountName, scheduledBuilds);
  Log.newLine();

  if (commandCtx.waitForBuildEnd) {
    const builds = await waitForBuildEndAsync(
      commandCtx,
      scheduledBuilds.map(i => i.buildId)
    );
    printBuildResults(commandCtx.accountName, builds);
    exitWithNonZeroCodeIfSomeBuildsFailed(builds);
  }
}

async function startBuildsAsync(
  commandCtx: CommandContext
): Promise<{ platform: Platform; buildId: string }[]> {
  const shouldBuildAndroid = [RequestedPlatform.Android, RequestedPlatform.All].includes(
    commandCtx.requestedPlatform
  );
  const shouldBuildiOS = [RequestedPlatform.iOS, RequestedPlatform.All].includes(
    commandCtx.requestedPlatform
  );
  const easConfig = await new EasJsonReader(
    commandCtx.projectDir,
    commandCtx.requestedPlatform
  ).readAsync(commandCtx.profile);

  const builds: {
    platform: Platform;
    sendBuildRequestAsync: () => Promise<string>;
  }[] = [];
  if (shouldBuildAndroid) {
    const sendBuildRequestAsync = await prepareAndroidBuildAsync(commandCtx, easConfig);
    builds.push({ platform: Platform.ANDROID, sendBuildRequestAsync });
  }
  if (shouldBuildiOS) {
    const sendBuildRequestAsync = await prepareIosBuildAsync(commandCtx, easConfig);
    builds.push({ platform: Platform.IOS, sendBuildRequestAsync });
  }
  return Promise.all(
    builds.map(async ({ platform, sendBuildRequestAsync }) => ({
      platform,
      buildId: await sendBuildRequestAsync(),
    }))
  );
}

async function waitForBuildEndAsync(
  commandCtx: CommandContext,
  buildIds: string[],
  { timeoutSec = 1800, intervalSec = 30 } = {}
): Promise<(Build | null)[]> {
  Log.log('Waiting for build to complete. You can press Ctrl+C to exit.');
  const spinner = ora().start();
  let time = new Date().getTime();
  const endTime = time + timeoutSec * 1000;
  while (time <= endTime) {
    const builds: (Build | null)[] = await Promise.all(
      buildIds.map(async buildId => {
        try {
          const { data } = await apiClient
            .get(`projects/${commandCtx.projectId}/builds/${buildId}`)
            .json();
          return data;
        } catch (err) {
          return null;
        }
      })
    );
    if (builds.length === 1) {
      const build = builds[0] as Build;
      switch (build.status) {
        case BuildStatus.FINISHED:
          spinner.succeed('Build finished');
          return builds;
        case BuildStatus.IN_QUEUE:
          spinner.text = 'Build queued...';
          break;
        case BuildStatus.CANCELED:
          spinner.text = 'Build canceled';
          spinner.stopAndPersist();
          return builds;
        case BuildStatus.IN_PROGRESS:
          spinner.text = 'Build in progress...';
          break;
        case BuildStatus.ERRORED:
          spinner.fail('Build failed');
          if (build.error) {
            return builds;
          } else {
            throw new Error(`Standalone build failed!`);
          }
        default:
          spinner.warn('Unknown status.');
          throw new Error(`Unknown status: ${builds} - aborting!`);
      }
    } else {
      if (builds.filter(build => build?.status === BuildStatus.FINISHED).length === builds.length) {
        spinner.succeed('All builds have finished');
        return builds;
      } else if (
        builds.filter(build =>
          build?.status
            ? [BuildStatus.FINISHED, BuildStatus.ERRORED, BuildStatus.CANCELED].includes(
                build.status
              )
            : false
        ).length === builds.length
      ) {
        spinner.fail('Some of the builds were canceled or failed.');
        return builds;
      } else {
        const inQueue = builds.filter(build => build?.status === BuildStatus.IN_QUEUE).length;
        const inProgress = builds.filter(build => build?.status === BuildStatus.IN_PROGRESS).length;
        const errored = builds.filter(build => build?.status === BuildStatus.ERRORED).length;
        const finished = builds.filter(build => build?.status === BuildStatus.FINISHED).length;
        const canceled = builds.filter(build => build?.status === BuildStatus.CANCELED).length;
        const unknownState = builds.length - inQueue - inProgress - errored - finished;
        spinner.text = [
          inQueue && `Builds in queue: ${inQueue}`,
          inProgress && `Builds in progress: ${inProgress}`,
          canceled && `Builds canceled: ${canceled}`,
          errored && chalk.red(`Builds failed: ${errored}`),
          finished && chalk.green(`Builds finished: ${finished}`),
          unknownState && chalk.red(`Builds in unknown state: ${unknownState}`),
        ]
          .filter(i => i)
          .join('\t');
      }
    }
    time = new Date().getTime();
    await sleep(intervalSec * 1000);
  }
  spinner.warn('Timed out');
  throw new Error(
    'Timeout reached! It is taking longer than expected to finish the build, aborting...'
  );
}

function exitWithNonZeroCodeIfSomeBuildsFailed(maybeBuilds: (Build | null)[]): void {
  const failedBuilds = (maybeBuilds.filter(i => i) as Build[]).filter(i => i.status === 'errored');
  if (failedBuilds.length > 0) {
    process.exit(1);
  }
}
