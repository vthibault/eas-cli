import { getConfig } from '@expo/config';
import { Command } from '@oclif/command';
import { HTTPError } from 'got';
import ora from 'ora';

import { apiClient } from '../../api';
import { Build } from '../../build/types';
import formatBuild from '../../build/utils/formatBuild';
import Log from '../../log';
import {
  findProjectRootAsync,
  getProjectAccountNameAsync,
  getProjectFullNameAsync,
  getProjectIdAsync,
} from '../../project/projectUtils';

export default class BuildView extends Command {
  static description = 'view a build for your project';

  static args = [{ name: 'BUILD_ID' }];

  async run() {
    const { BUILD_ID: buildId } = this.parse(BuildView).args;

    const projectDir = (await findProjectRootAsync()) ?? process.cwd();
    const { exp } = getConfig(projectDir, { skipSDKVersionRequirement: true });
    const projectId = await getProjectIdAsync(exp);
    const accountName = await getProjectAccountNameAsync(exp);
    const projectName = await getProjectFullNameAsync(exp);

    const spinner = ora().start('Fetching the build…');

    try {
      let build: Build;

      if (buildId == null) {
        const response = await apiClient.get<{ data: { builds: Build[] } }>(
          `projects/${projectId}/builds`,
          {
            searchParams: { limit: 1 },
            responseType: 'json',
          }
        );

        build = response.body.data.builds[0];
      } else {
        const response = await apiClient.get<{ data: Build }>(
          `projects/${projectId}/builds/${buildId}`,
          {
            responseType: 'json',
          }
        );

        build = response.body.data;
      }

      if (buildId) {
        spinner.succeed(`Found a matching build for the project ${projectName}`);
      } else {
        spinner.succeed(`Showing the last build for the project ${projectName}`);
      }

      Log.log(`\n${formatBuild(build, { accountName })}`);
    } catch (e) {
      const error = e as HTTPError;

      if (error.response.statusCode === 400) {
        if (buildId) {
          spinner.fail(
            `Couldn't find a build for the project ${projectName} matching the id ${buildId}`
          );
        } else {
          spinner.fail(`Couldn't find any builds for the project ${projectName}`);
        }
      } else {
        if (buildId) {
          spinner.fail(`Something went wrong and we couldn't fetch the build with id ${buildId}`);
        } else {
          spinner.fail(
            `Something went wrong and we couldn't fetch the last build for the project ${projectName}`
          );
        }
      }

      throw error;
    }
  }
}
