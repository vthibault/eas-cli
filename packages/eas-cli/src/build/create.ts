import { EasJsonReader } from '@expo/eas-json';
import chalk from 'chalk';
// @ts-ignore
import Spinnies from 'spinnies';

import { apiClient } from '../api';
import log from '../log';
import { sleep } from '../utils/promise';
import { endTimer, formatMilliseconds, hasTimer, startTimer } from '../utils/timer';
import { prepareAndroidBuildAsync } from './android/build';
import { platformDisplayNames } from './constants';
import { CommandContext } from './context';
import { prepareIosBuildAsync } from './ios/build';
import { Build, BuildStatus, Platform, RequestedPlatform } from './types';
import { printBuildResults, printLogsUrls } from './utils/printBuildInfo';
import { ensureGitRepoExistsAsync, ensureGitStatusIsCleanAsync } from './utils/repository';

const useMockBuilds = false;
const testLogging = false;

export async function buildAsync(commandCtx: CommandContext): Promise<void> {
  await ensureGitRepoExistsAsync();
  await ensureGitStatusIsCleanAsync(commandCtx.nonInteractive);

  if (testLogging) {
    await waitForBuildEndAsync(commandCtx, Object.keys(mockBuilds));
    process.exit(0);
  }

  const scheduledBuilds = await startBuildsAsync(commandCtx);

  log.newLine();
  printLogsUrls(commandCtx.accountName, scheduledBuilds);
  log.newLine();

  if (commandCtx.waitForBuildEnd) {
    await waitForBuildEndAsync(
      commandCtx,
      scheduledBuilds.map(i => i.buildId)
    );
    // log.newLine();
    // printBuildResults(commandCtx.accountName, builds);
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
    builds.push({ platform: Platform.Android, sendBuildRequestAsync });
  }
  if (shouldBuildiOS) {
    const sendBuildRequestAsync = await prepareIosBuildAsync(commandCtx, easConfig);
    builds.push({ platform: Platform.iOS, sendBuildRequestAsync });
  }

  if (useMockBuilds) {
    return [Object.values(mockBuilds)].filter(Boolean) as any;
  }

  return Promise.all(
    builds.map(async ({ platform, sendBuildRequestAsync }) => ({
      platform,
      buildId: await sendBuildRequestAsync(),
    }))
  );
}

const mockBuilds: Record<string, any> = {
  '5ef5e676-b127-4b9e-bf7b-37827721e039': {
    id: '5ef5e676-b127-4b9e-bf7b-37827721e039',
    platform: 'android',
    status: BuildStatus.IN_PROGRESS,
    artifacts: {
      buildUrl:
        'https://somn-really-long.io/accounts/expo-turtle/builds/aff486c1-cb2f-49c4-86dd-649d0f68578a',
    },
  },
  'aff486c1-cb2f-49c4-86dd-649d0f68578a': {
    id: 'aff486c1-cb2f-49c4-86dd-649d0f68578a',
    platform: 'ios',
    status: BuildStatus.IN_QUEUE,
  },
  // 'bff486c1-cb2f-49c4-86dd-649d0f68578a': {
  //   id: 'bff486c1-cb2f-49c4-86dd-649d0f68578a',
  //   platform: 'windows',
  //   status: BuildStatus.IN_PROGRESS,
  // },
  // 'dff486c1-cb2f-49c4-86dd-649d0f68578a': {
  //   id: 'dff486c1-cb2f-49c4-86dd-649d0f68578a',
  //   platform: 'web',
  //   status: BuildStatus.ERRORED,
  // },

  // '5ef5e676-b127-4b9e-bf7b-37827721e040': '5ef5e676-b127-4b9e-bf7b-37827721e040',
};

let i = 0;
function getMockBuilds(ids: string[]): (Build | string)[] {
  i++;
  const results: (Build | string)[] = [];
  for (const id of ids) {
    results.push(mockBuilds[id]);
  }

  if (i > 1) {
    return [
      {
        id: '5ef5e676-b127-4b9e-bf7b-37827721e039',
        platform: 'android',
        status: BuildStatus.FINISHED,
        artifacts: {
          buildUrl:
            'https://somn-really-long.io/accounts/expo-turtle/builds/aff486c1-cb2f-49c4-86dd-649d0f68578a',
        },
      },
      {
        id: 'aff486c1-cb2f-49c4-86dd-649d0f68578a',
        platform: 'ios',
        artifacts: {
          buildUrl:
            'https://somn-really-long.io/accounts/expo-turtle/builds/aff486c1-cb2f-49c4-86dd-649d0f68578a',
        },
        status: BuildStatus.FINISHED,
      },
      // {
      //   id: 'aff486c1-cb2f-49c4-86dd-649d0f68578a',
      //   platform: 'web',
      //   artifacts: {
      //     buildUrl:
      //       'https://somn-really-long.io/accounts/expo-turtle/builds/aff486c1-cb2f-49c4-86dd-649d0f68578a',
      //   },
      //   status: BuildStatus.IN_QUEUE,
      // },
    ] as any;
  }

  return results;
}

function pad(str: string, width: number): string {
  const len = Math.max(0, width - str.length);
  return str + Array(len + 1).join(' ');
}

function longestStringLength(values: string[]): number {
  return values.reduce((max, option) => Math.max(max, option.length), 0);
}

async function waitForBuildEndAsync(
  commandCtx: CommandContext,
  buildIds: string[],
  { timeoutSec = 1800, intervalSec = 30 } = {}
): Promise<(Build | null)[]> {
  log(
    `\u203A Waiting for build${
      buildIds.length !== 1 ? 's' : ''
    } to complete. ${chalk.dim`You can exit with Ctrl+C`}`
  );
  let time = new Date().getTime();
  const endTime = time + timeoutSec * 1000;

  const spinnies = new Spinnies();
  const unknownName = 'Pending';

  while (time <= endTime) {
    // const builds = getMockBuilds(buildIds);
    const builds: (Build | string)[] = await Promise.all(
      buildIds.map(async buildId => {
        try {
          const { data } = await apiClient
            .get(`projects/${commandCtx.projectId}/builds/${buildId}`)
            .json();
          return data;
        } catch (err) {
          return buildId;
        }
      })
    );

    const padWidth = longestStringLength(
      builds.map(build => {
        if (typeof build === 'string') return unknownName;
        return build.platform;
      })
    );

    for (const build of builds) {
      let id = '';
      if (typeof build === 'string') {
        id = build;
      } else {
        id = build.id;
      }

      if (!id) continue;

      // Ensure spinner
      if (!spinnies.pick(id)) {
        spinnies.add(id, { text: '' });
      }
      if (!hasTimer(id)) {
        startTimer(id);
      }
      const tableFormat = (name: string, msg: string) =>
        `${chalk.bold(pad(name, padWidth))} ${msg}`;

      if (typeof build === 'string') {
        spinnies.update(id, {
          text: chalk.dim(tableFormat(unknownName, id)),
          spinnerColor: 'gray',
        });
      } else {
        const prefixed = (msg: string) => {
          return tableFormat(platformDisplayNames[build.platform] ?? build.platform, msg);
        };
        switch (build.status) {
          case BuildStatus.IN_QUEUE:
            spinnies.update(id, {
              text: prefixed('Waiting in queue...'),
              spinnerColor: 'white',
            });
            break;
          case BuildStatus.IN_PROGRESS:
            spinnies.update(id, {
              text: chalk.cyan(prefixed('Building...')),
              spinnerColor: 'cyan',
            });
            break;
          case BuildStatus.ERRORED:
            {
              const duration = formatMilliseconds(endTimer(id, false) ?? 0);
              const durationLabel = duration ? ` in ${duration}` : '';
              spinnies.fail(id, { text: prefixed(`(Failed${durationLabel})`) });
            }
            break;
          case BuildStatus.FINISHED:
            {
              const duration = formatMilliseconds(endTimer(id, false) ?? 0);
              const durationLabel = duration ? ` in ${duration}` : '';
              const url = build.artifacts?.buildUrl;
              spinnies.succeed(id, {
                text: prefixed(`(Succeeded${durationLabel})\n${url}\n`),
              });
            }
            break;
        }
      }
    }

    const expectedBuilds = builds.filter(build => typeof build !== 'string') as Build[];

    const complete =
      expectedBuilds.filter(build => {
        return [BuildStatus.FINISHED, BuildStatus.ERRORED].includes(build.status);
      }).length === builds.length;

    if (complete) {
      return expectedBuilds;
    }

    time = new Date().getTime();
    if (testLogging) {
      await sleep(intervalSec * 100);
    } else {
      await sleep(intervalSec * 1000);
    }
  }

  spinnies.stopAll('stopped');

  throw new Error(
    'Timeout reached! It is taking longer than expected to finish the build, aborting...'
  );
}
