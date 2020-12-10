import { Progress } from 'got';
import ProgressBar from 'progress';

type ProgressTracker = (progress: Progress) => void;

function createProgressTracker(_total?: number, message: string = ''): ProgressTracker {
  let bar: ProgressBar | null = null;
  let transferredSoFar = 0;
  return (progress: Progress) => {
    if (!bar && (progress.total !== undefined || _total !== undefined)) {
      const total = (_total ?? progress.total) as number;
      bar = new ProgressBar(`${message}[:bar] :percent :etas`, {
        complete: '=',
        incomplete: ' ',
        total,
        width: Math.max(56, 64 - message.length),
      });
    }
    if (bar) {
      bar.tick(progress.transferred - transferredSoFar);
    }
    transferredSoFar = progress.transferred;
  };
}

export { createProgressTracker };
