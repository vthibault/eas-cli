import { promptAsync } from '../../prompts';
import { Action, CredentialsManager } from '../CredentialsManager';
import { Context } from '../context';
import { ManageIosBeta } from './ManageIosBeta';
import { SelectAndroidApp } from './SelectAndroidApp';

export class SelectPlatform implements Action {
  async runAsync(manager: CredentialsManager, ctx: Context): Promise<void> {
    const { platform } = await promptAsync({
      type: 'select',
      name: 'platform',
      message: 'Select platform',
      choices: [
        { value: 'android', title: 'Android' },
        { value: 'ios', title: 'iOS' },
      ],
    });
    // TODO: DO NOT COMMMIT THIS!
    const action = platform === 'ios' ? new ManageIosBeta() : new SelectAndroidApp();
    await manager.runActionAsync(action);
  }
}
