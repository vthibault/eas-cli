import chalk from 'chalk';
import { Progress } from 'got';
import ora from 'ora';

type ProgressHandler = (props: {
  progress?: Progress;
  isComplete?: boolean;
  error?: Error;
}) => void;

function createProgressTracker({
  total,
  message,
}: {
  total?: number;
  message: string;
}): ProgressHandler {
  let bar: ora.Ora | null = null;
  let calcTotal: number = total ?? 0;
  let transferredSoFar = 0;
  let current = 0;
  let timer: number = 0;
  const withPercent = (v: number) => {
    const ratio = Math.min(Math.max(v, 0), 1);
    const percent = Math.floor(ratio * 100);
    return `${message} ${percent.toFixed(0)}%`;
  };

  return ({ progress, isComplete, error }) => {
    if (progress) {
      if (!bar && (progress.total !== undefined || total !== undefined)) {
        calcTotal = (total ?? progress.total) as number;
        bar = ora(withPercent(0)).start();
        timer = Date.now();
      }
      if (progress.total) {
        calcTotal = progress.total;
      }
      if (bar) {
        let percentage = 0;
        if (progress.percent) {
          percentage = progress.percent;
        } else {
          current += progress.transferred - transferredSoFar;
          percentage = current / calcTotal;
        }

        bar.text = withPercent(percentage);
      }
      transferredSoFar = progress.transferred;
    }

    if (!bar) return;

    if (error) {
      bar.fail(`Uploading project to EAS failed`);
    } else if (isComplete) {
      const duration = timer ? Date.now() - timer : 0;
      const prettyTime = timeConversion(duration);
      bar.succeed(`Uploaded to EAS ${chalk.dim(prettyTime)}`);
    }
  };
}

function timeConversion(duration: number) {
  const portions: string[] = [];

  const msInHour = 1000 * 60 * 60;
  const hours = Math.trunc(duration / msInHour);
  if (hours > 0) {
    portions.push(hours + 'h');
    duration = duration - hours * msInHour;
  }

  const msInMinute = 1000 * 60;
  const minutes = Math.trunc(duration / msInMinute);
  if (minutes > 0) {
    portions.push(minutes + 'm');
    duration = duration - minutes * msInMinute;
  }

  const seconds = Math.trunc(duration / 1000);
  if (seconds > 0) {
    portions.push(seconds + 's');
  }

  return portions.join(' ');
}

// function timeConversion(millisec: number): string {
//   const seconds = round(millisec / 1000, 1);
//   if (seconds < 60) {
//     return seconds + 's';
//   }

//   const minutes = round(millisec / (1000 * 60), 1);
//   if (minutes < 60) {
//     return minutes + 'm';
//   }

//   const hours = round(millisec / (1000 * 60 * 60), 1);
//   return hours + 'h';
// }

// function round(value: number, precision: number) {
//   var multiplier = Math.pow(10, precision || 0);
//   return Math.round(value * multiplier) / multiplier;
// }

export { createProgressTracker };
