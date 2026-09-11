# 使用与迁移

## 配置连接

连接设置支持Chat Completions和Responses两种兼容协议。Base URL可以是域名、API前缀或完整端点，工具会归一化后追加对应路径。域名根路径默认使用/v1；已提供/custom/v1之类的前缀会保留。

远程地址必须是HTTPS，本机模拟端点允许HTTP。地址不能包含用户名、密码、查询参数或片段。模型名称必须与提供商支持的标识一致；默认gpt-6-astra只是请求标识。

常见参数包括思考强度、输出上限、超时以及Chat的max_completion_tokens/max_tokens字段。接口返回400时先核对这些参数。不同连接分别保存配置，更换地址时需重新提供Key。

可以单独指定视觉评审连接。它需要支持图像输入；生成模型可以与评审模型不同。使用同一模型自评时，分数不属于独立评审。

## 批次与计划

| 设置 | 范围 | 默认 |
|---|---|---|
| 每个连接轮数 | 1～100 | 3 |
| 每批连接数 | 1～8 | 当前连接 |
| 每批生成并发 | 1～8 | 2 |
| 全局生成并发 | 1～8 | 4 |
| 全局视觉评审并发 | 1～2 | 1 |
| 自动重试 | 0～3 | 0 |
| 计划间隔 | 1～10080分钟 | 10分钟 |

暂停批次会停止发出新请求，已发出的请求继续收尾。取消会停止本机等待，供应商是否同时停止计算或计费取决于接口。答错不会自动重测；重试主要用于可重试接口错误。

同一计划仍有未完成批次时不会重复启动。关机、休眠或服务关闭时无法执行；恢复后不密集补跑漏掉的轮次。服务重启后未完成批次暂停，已发出的请求标记中断，避免自动重复计费。

## 保存在哪里

默认数据目录为项目根目录：

| 文件或目录 | 内容 |
|---|---|
| settings.json | 连接、计划、阈值、基线和可选的加密Key |
| records.json | 所有结果的索引与评分 |
| queue.json | 批次、任务、重试和执行状态 |
| archive/ | 每条回答的独立归档 |
| artifacts/ | HTML、播放器、缩略图、三帧截图和评审结果 |

以上文件均被Git忽略。需要改变目录时，在启动前设置MODEL_PROBE_DATA_DIR。服务只读取进程环境变量，不自动加载.env文件。

PowerShell7示例：

```powershell
$env:MODEL_PROBE_DATA_DIR = Join-Path $env:LOCALAPPDATA 'TestYourAstra'
npm start
```

Linux/macOS示例：

```sh
MODEL_PROBE_DATA_DIR="$HOME/.local/share/test-your-astra" npm start
```

MODEL_PROBE_BROWSER可以指定Chrome/Edge/Chromium的可执行文件路径；Windows的MODEL_PROBE_PWSH可以指定pwsh.exe。MODEL_PROBE_BASE_URL设置初始默认接口，MODEL_PROBE_API_KEY提供会话Key；请通过环境注入管理Key，不要写入仓库脚本或提交到Git。

## 导出与迁移

当前批次提供JSON和CSV。JSON含回答、题目和当批评审快照，CSV适合自行统计；后续重评不会覆盖旧批次采用的评分快照。

完整迁移前暂停计划并等待队列收尾，再停止服务，备份数据文件及archive/artifacts。复制加密Key到另一Windows用户或电脑通常无法解密，需要重新输入。分享时不要包含settings.json、个人作品或未脱敏的回答。

公开发行包是全新安装，不带原作者的连接、Key、历史成绩或计划。

## 常见问题

**页面打开但没有连接。** 先填写Base URL和Key；使用公开源码时没有预置地址。免密接口需明确勾选“免密接口”。

**点击tool.html无法完整运行。** 请运行npm start或Windows启动器，再打开本机服务地址。

**找不到渲染浏览器。** 安装Chrome/Edge/Chromium，或设置MODEL_PROBE_BROWSER。不要把网页URL填在这个变量里。

**记住Key失败。** Windows上检查PowerShell7；Linux/macOS使用会话Key。不要改用不安全的明文配置保存。

**评审未完成但作品已生成。** HTML和截图仍保存，可在作品页重新评估，不必重新生成；重新图像评审会产生用量。

**背景在动，为什么未通过？** 背景运动不等于鹈鹕在骑行，查看动作维度和原始证据。3帧采样也可能漏掉部分周期。

**端口被占用。** 已有工具可能正在运行，打开已有地址或使用npm start -- --port 4318。不要同时让两个服务写入同一数据目录。
