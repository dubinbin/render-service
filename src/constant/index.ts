export const MAX_RECEIVE_FILE_LEN = 20;

export const minuteExpire = 5;

export const DAY_EXPIRE = 15;

export const ONE_DAY_LEN = 24 * 60 * 60 * 1000;

export const CALLBACK_CLIENT_URL = 'http://192.168.20.165:3000';

export const FILE_DATA_PATH = 'http://192.168.10.150:5000';

export enum TASK_STATUS_FROM_MQTT {
  'finished' = 'finished',
  'accept' = 'accept',
  'reject' = 'reject',
  'remove' = 'remove',
  'working' = 'working',
}

export enum LOG_STAGE {
  'start' = 'start',
  'processing' = 'processing',
  'completed' = 'completed',
}

export interface IRenderTaskTypeFromTask {
  projectId: string;
  payload: string;
  clientId: string;
  clientJwt: string;
}

export interface IRenderTaskType {
  projectId: string;
  payload: IRenderDataType;
  clientId: string;
  clientJwt: string;
}

export interface IRenderDataType {
  camera: CameraParams[];
  modelName: string;
  renderParams: RenderParams;
  materialList: MaterialList[];
}

export interface MaterialList {
  originalMaterialName: string;
  newMaterialName: string;
  properties: MaterialProperties;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MaterialProperties {}

export interface RenderParams {
  quality: string;
}

export interface CameraParams {
  x: number;
  y: number;
  z: number;
  cameraPitch: number;
  cameraYaw: number;
  cameraRoll: number;
  cameraZoom: number;
}
