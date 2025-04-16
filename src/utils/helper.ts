// 方案2：使用类型联合

import { RenderParams } from '@/types';

export function renderTemplate(
  template: string,
  variables: RenderParams
): string {
  return Object.entries(variables).reduce((result, [key, value]) => {
    let finalValue: string;
    if (key === 'replacementItems') {
      // 处理数组对象，转换为 Python 列表格式
      finalValue = JSON.stringify(value).replace(/"/g, "'"); // 只将所有双引号换成单引号
    } else {
      finalValue = String(value);
    }
    return result.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), finalValue);
  }, template);
}
