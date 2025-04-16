export type StateUser = {
  aud: string;
  email: string;
  exp: number;
  iat: number;
  userId: string;
};

interface ReplacementItem {
  target: string;
  fbx: string;
  collection_name: string;
}

export interface RenderParams {
  taskId: string;
  cameraLocationX: number;
  cameraLocationY: number;
  cameraLocationZ: number;
  cameraPitch: number;
  cameraYaw: number;
  cameraRoll: number;
  cameraZoom: number;
  outputDir: string;
  blendFilePath: string;
  replacementItems: ReplacementItem[]; // 新增的替换项数组
  quality: string;
}
