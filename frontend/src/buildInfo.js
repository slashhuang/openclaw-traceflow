/**
 * 由 Vite `define` 在 build / dev 启动时注入，用于在界面区分当前静态资源对应哪次打包。
 * CI 可覆盖：VITE_APP_BUILD_TIME、VITE_APP_GIT_SHA（见 frontend/vite.config.js）
 */
export const APP_BUILD_TIME_ISO = import.meta.env.VITE_APP_BUILD_TIME || ''
export const APP_GIT_SHA = import.meta.env.VITE_APP_GIT_SHA || ''
