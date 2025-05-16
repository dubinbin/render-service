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
  outputDir: string;
  blendFilePath: string;
  replacementItems: ReplacementItem[]; // 新增的替换项数组
  quality: string;
  blenderRunPath: string;
  // 透传前端参数，写到py脚本，由python脚本内部完成一个子任务的时候自己去回调api接口，主要是这样花销小一点
  clientId: string;
  clientJwt: string;
  fileDataId: string;
}

export interface CallbackParams {
  clientId: string;
  clientJwt: string;
  fileDataId: string;
}
