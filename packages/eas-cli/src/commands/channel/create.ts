import { getConfig } from '@expo/config';
import { Command, flags } from '@oclif/command';
import chalk from 'chalk';
import gql from 'graphql-tag';

import { graphqlClient, withErrorHandlingAsync } from '../../graphql/client';
import {
  CreateUpdateChannelOnAppMutation,
  CreateUpdateChannelOnAppMutationVariables,
} from '../../graphql/generated';
import Log from '../../log';
import { ensureProjectExistsAsync } from '../../project/ensureProjectExists';
import {
  findProjectRootAsync,
  getBranchByNameAsync,
  getProjectAccountNameAsync,
} from '../../project/projectUtils';
import { promptAsync } from '../../prompts';
import { createUpdateBranchOnAppAsync } from '../branch/create';

async function createUpdateChannelOnAppAsync({
  appId,
  channelName,
  branchId,
}: {
  appId: string;
  channelName: string;
  branchId: string;
}): Promise<CreateUpdateChannelOnAppMutation> {
  // Point the new channel at a branch with its same name.
  const branchMapping = JSON.stringify({
    data: [{ branchId, branchMappingLogic: 'true' }],
    version: 0,
  });
  return await withErrorHandlingAsync(
    graphqlClient
      .mutation<CreateUpdateChannelOnAppMutation, CreateUpdateChannelOnAppMutationVariables>(
        gql`
          mutation CreateUpdateChannelOnApp($appId: ID!, $name: String!, $branchMapping: String!) {
            updateChannel {
              createUpdateChannelForApp(appId: $appId, name: $name, branchMapping: $branchMapping) {
                id
                name
                branchMapping
              }
            }
          }
        `,
        {
          appId,
          name: channelName,
          branchMapping,
        }
      )
      .toPromise()
  );
}

export default class ChannelCreate extends Command {
  static hidden = true;
  static description = 'Create a channel on the current project.';

  static args = [
    {
      name: 'name',
      required: false,
      description: 'Name of the channel to create',
    },
  ];

  static flags = {
    json: flags.boolean({
      description:
        'print output as a JSON object with the new channel ID, name and branch mapping.',
      default: false,
    }),
  };

  async run() {
    let {
      args: { name: channelName },
      flags: { json: jsonFlag },
    } = this.parse(ChannelCreate);

    const projectDir = await findProjectRootAsync(process.cwd());
    if (!projectDir) {
      throw new Error('Please run this command inside a project directory.');
    }
    const { exp } = getConfig(projectDir, { skipSDKVersionRequirement: true });
    const accountName = await getProjectAccountNameAsync(exp);
    const { slug } = exp;
    const projectId = await ensureProjectExistsAsync({
      accountName,
      projectName: slug,
    });

    if (!channelName) {
      const validationMessage = 'Channel name may not be empty.';
      if (jsonFlag) {
        throw new Error(validationMessage);
      }
      ({ name: channelName } = await promptAsync({
        type: 'text',
        name: 'name',
        message: 'Please name the channel:',
        validate: value => (value ? true : validationMessage),
      }));
    }

    let branchId: string;
    let branchMessage: string;
    try {
      const existingBranch = await getBranchByNameAsync({
        appId: projectId,
        name: channelName,
      });
      branchId = existingBranch.id;
      branchMessage = `We found a branch with the same name`;
    } catch (e) {
      const newBranch = await createUpdateBranchOnAppAsync({
        appId: projectId,
        name: channelName,
      });
      branchId = newBranch.id;
      branchMessage = `We also went ahead and made a branch with the same name`;
    }

    const {
      updateChannel: { createUpdateChannelForApp: newChannel },
    } = await createUpdateChannelOnAppAsync({
      appId: projectId,
      channelName,
      branchId,
    });

    if (!newChannel) {
      throw new Error(
        `Could not create channel with name ${channelName} on app with id ${projectId}`
      );
    }

    if (jsonFlag) {
      Log.log(JSON.stringify(newChannel));
      return;
    }

    Log.withTick(
      `️Created a new channel ${chalk.bold(newChannel.name)} on project ${chalk.bold(
        `@${accountName}/${slug}`
      )}. ${branchMessage} and have pointed the channel at it. You can now update your app by publishing!`
    );
  }
}
