/**
 * OpenClaw TraceFlow 颜色字典
 * 只改此文件即可统一调整整站主题色（偏玫瑰红/珊瑚粉）
 *
 * 修改 bodyBg 时请同步 styles/index.css 里 [data-theme] body 的首屏回退值。
 */
export const palette = {
  light: {
    // 玫瑰红 / 珊瑚粉（偏粉不偏橙）
    primary: '#ec4899',
    primaryHover: '#db2777',
    success: '#16a34a',
    warning: '#f59e0b',
    error: '#f43f5e',
    info: '#ec4899',
    // 你的“内容区浅粉底”：253,239,236
    bodyBg: '#fdefec',
    containerBg: '#ffffff',
    borderSecondary: '#f1e3e0',
    headerBg: '#ffffff',
    siderBg: '#ffffff',
  },
  dark: {
    // 深色下用更浅的珊瑚粉，在深底上更柔和
    primary: '#f472b6',
    primaryHover: '#ec4899',
    success: '#22c55e',
    warning: '#fbbf24',
    error: '#fb7185',
    info: '#f472b6',
    bodyBg: '#0c0a09',
    containerBg: '#1c1917',
    borderSecondary: '#292524',
    headerBg: '#1c1917',
    siderBg: '#1c1917',
  },
};

export default palette;
