# 测试你的astra模型是否降智

[![CI](https://github.com/Onward0131/test-your-astra/actions/workflows/ci.yml/badge.svg)](https://github.com/Onward0131/test-your-astra/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

用糖果推理和鹈鹕SVG动画连续检测模型表现，直接查看每轮结论、作品、评分及异常依据。

这是一个在你电脑上运行的工具：浏览器负责操作，本机Node.js服务负责请求、排队、定时和保存。默认模型标识为`gpt-6-astra`，Base URL和Key由你填写，也支持其他模型与多个兼容接口。

**它用于发现表现变化。两道题、接口返回的模型名或一次画风变化，都不能认证后端模型身份或证明整体能力下降。**

## 能做什么

| 功能 | 使用方式 |
|---|---|
| 双题并行 | 一次选择1～100轮；默认3轮、生成并发2 |
| 多接口比较 | 添加自己的Base URL、Key和模型；每批最多8个连接 |
| 糖果判定 | 识别最终结论，支持自动计算答案的数字变式 |
| 自动视觉评审 | 运行保存的HTML，采集3帧并评估骑行动作等5个维度 |
| 直观结果 | 每轮缩略图、播放动画、完整回答、原始分数、扣分解释 |
| 画风对照 | 本地比较配色、布局和边缘；可指定参考作品和预警阈值 |
| 后台计划 | 默认间隔10分钟，可改为1～10080分钟，支持暂停 |
| 历史与复测 | 保存作品和证据、设置可信基线、按原条件复测、导出JSON/CSV |

生成与视觉评审使用独立队列，支持暂停、取消、失败重试和重启恢复。实际请求并发还受全局上限和提供商限流约束。

## 快速开始

### Windows便携版

从[Releases](https://github.com/Onward0131/test-your-astra/releases)下载Windows x64便携包，解压到可写目录，双击`Open-Model-Probe.vbs`。

便携包附带Node.js和依赖。自动渲染需要已安装的Edge或Chrome；“本机加密记住Key”还需要PowerShell7，不勾选也可使用会话Key。

### 从源码运行

需要Node.js22.12或更高版本及npm。完整视觉功能需要Edge、Chrome或Chromium。

```sh
git clone https://github.com/Onward0131/test-your-astra.git
cd test-your-astra
npm ci
npm start
```

打开终端显示的本机地址，默认是`http://127.0.0.1:4317/`。如端口被占用：

```sh
npm start -- --port 4318
```

1. 点击“连接设置”，填写Base URL、Key和供应商实际支持的模型标识。
2. 在“新建检测”选择轮数、题目和连接，点击“开始批量检测”。
3. 每个回答独立保存；鹈鹕生成后继续自动截图与评审。
4. 点击糖果查看完整回答，点击缩略图播放动画；异常依据在每轮卡片和对照区域显示。

首次启动没有预置Key、提供商地址、历史成绩或已启用计划。不要直接双击`tool.html`使用完整功能。

## 怎么读结果

- **糖果**：原题允许按手感选择形状，标准答案21。最终结论21时，正文讨论29也通过；最终改答29仍未通过；“21或29”记为不确定。可识别的错误取法会单独指出。
- **鹈鹕**：通过需总分至少75，同时满足关键分项、置信度和运行检测。均分只纳入有明确通过/未通过判定的有效评分。
- **画风**：默认差异阈值32/100，可调10～90。偏离单独预警，不改原始质量分；背景、构图和采样时刻也会影响差异。
- **基线**：先保存你认可的批次，再以相同连接、参数和评审条件复测。接口错误、未完成评审和答案错误分别计数。

详细方法、阈值和局限见[评估说明](docs/EVALUATION.md)。

## 用量与本地数据

默认3轮双题需要6次生成，启用自动视觉评审时另有最多3次图像评审；重试可能增加用量。图像评审会把3张作品截图发送给你配置的评审连接，本地画风对比不产生API请求。

回答、HTML、截图和评分默认保存在项目目录。Key仅保留在当前服务进程内；Windows上可选择使用当前用户的DPAPI加密记住。仓库和公开下载包不包含任何真实Key或个人历史。

关闭网页后，本机服务继续执行计划；关机、休眠或退出服务后不会执行。后台计划需手动创建并启用。

[使用与迁移](docs/USAGE.md) · [安全说明](SECURITY.md)

## 开发与复用

```sh
npm run build
npm run check
npm test
```

`npm test`使用本地模拟接口和合成数据，不访问真实模型接口、不消耗模型额度。CI检查Linux/Windows上的Node.js22、24。

- 前端源文件：`src/tool.template.html`、`src/app.js`；构建生成提交到仓库的`tool.html`。
- 核心模块：`core.cjs`、`benchmark.cjs`、`queue.cjs`、`appearance.cjs`等可独立引入。
- 浏览器/站内接入：`browser/model-probe.mjs`提供同源Key检测、Chat/Responses流解析和隔离播放器，见[集成说明](docs/BROWSER_INTEGRATION.md)。
- 架构和测试方式见[开发说明](docs/DEVELOPMENT.md)。
- 问题与功能建议请使用[Issues](https://github.com/Onward0131/test-your-astra/issues)；提交代码前阅读[贡献规范](CONTRIBUTING.md)。

## 许可证与项目关系

采用[MIT许可证](LICENSE)。第三方依赖保留各自许可证。

这是独立的模型表现检测工具，不代表OpenAI、模型提供商或满血.ai。产品交互参考了满血.ai直观看结果的思路；本仓库没有复制其源码、品牌或用户数据。
