import { checkPendingDids, checkUpgradeDids } from './didService.js';

let checkTaskInterval: NodeJS.Timeout | null = null;

export function startDidCheckTask(intervalSeconds: number) {
  if (checkTaskInterval) {
    clearInterval(checkTaskInterval);
  }

  console.log(`Starting DID check task with interval ${intervalSeconds} seconds`);
  
  // Initial check
  checkPendingDids().catch(err => console.error('Error in DID check task:', err));
  checkUpgradeDids().catch(err => console.error('Error in DID upgrade check task:', err));

  checkTaskInterval = setInterval(async () => {
    try {
      await checkPendingDids();
      await checkUpgradeDids();
    } catch (error) {
      console.error('Error in DID check task:', error);
    }
  }, intervalSeconds * 1000);
}

export function stopDidCheckTask() {
  if (checkTaskInterval) {
    clearInterval(checkTaskInterval);
    checkTaskInterval = null;
    console.log('Stopped DID check task');
  }
}
