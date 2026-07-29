# AGENTS.md

本文件适用于本仓库的全部文件。

## 开发原则

- 保持普通 Songloft JS 插件形态，不引入 Python 运行时、常驻进程、额外容器或音频转码。
- 搜索保持轻量；音频地址、歌词和封面仅在试听、入库或下载时按需解析。
- 不自动跨音乐来源替换歌曲；同源重解析失败后向用户展示明确错误。
- 下载必须保留上游现成格式，根目录始终由 Songloft `music_path` 决定。
- 页面默认隐藏底层网络错误，只有用户点击“查看详情”后才展示诊断信息。

## 安全规范

- 禁止提交账号、密码、Token、Cookie、Authorization、私有密钥、真实音频直链或本机绝对路径。
- 新增外部请求时必须设置超时，并避免把敏感请求头写入日志或错误响应。
- `source_data` 仅保存稳定来源身份和重新解析所需字段，不保存易过期的最终播放地址。
- 只声明实际使用的最小插件权限；新增权限必须同步说明用途并补测试。

## 文档与测试

- 修改 `README.md`、`SPEC.md` 或 `AGENTS.md` 时同步修改对应英文文件。
- 行为变化必须更新 `CHANGELOG.md` 和插件版本。
- 提交前运行：

```bash
corepack pnpm install
corepack pnpm test
corepack pnpm run typecheck
corepack pnpm run build
node scripts/validate-build.mjs
```

- 自动化测试必须使用模拟传输或本地服务，不依赖真实公网接口。
- `dist/`、`node_modules/`、环境文件、日志和密钥文件不得提交。
