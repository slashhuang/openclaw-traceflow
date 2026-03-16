/**
 * 配置验证模块
 * 验证 Futu OpenD 配置是否完整和正确
 */

function validateConfig(config) {
  const errors = [];
  const warnings = [];

  if (!config.futu) {
    errors.push('缺少 futu 配置');
    return { valid: false, errors, warnings };
  }

  // 验证账号
  if (!config.futu.accno) {
    errors.push('缺少 futu.accno（富途账号）');
  }

  // 验证认证方式：密码或 authcode 至少需要一个
  if (!config.futu.password && !config.futu.authcode) {
    warnings.push('缺少 futu.password 或 futu.authcode，可能导致登录失败（首次登录需要验证码）');
  }

  // 验证端口
  if (!config.futu.listenPort || config.futu.listenPort < 1 || config.futu.listenPort > 65535) {
    errors.push('futu.listenPort 必须在 1-65535 范围内');
  }

  if (!config.futu.websocketPort || config.futu.websocketPort < 1 || config.futu.websocketPort > 65535) {
    errors.push('futu.websocketPort 必须在 1-65535 范围内');
  }

  // 验证模式
  if (config.futu.isMod && ![1, 2].includes(config.futu.isMod)) {
    errors.push('futu.isMod 必须是 1（模拟）或 2（实盘）');
  }

  // 验证服务器地址
  if (!config.futu.server || !config.futu.server.includes(':')) {
    errors.push('futu.server 格式应为 host:port（例如：nz-futu-1.futunn.com:9292）');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

module.exports = {
  validateConfig
};
