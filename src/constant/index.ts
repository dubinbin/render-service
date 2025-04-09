export const MAX_RECEIVE_FILE_LEN = 20;

export const minuteExpire = 5;

export const DAY_EXPIRE = 15;

export const ONE_DAY_LEN = 24 * 60 * 60 * 1000;

export enum TASK_STATUS_FROM_MQTT {
  'finished' = 'finished',
  'accept' = 'accept',
  'reject' = 'reject',
  'remove' = 'remove',
  'working' = 'working',
}
