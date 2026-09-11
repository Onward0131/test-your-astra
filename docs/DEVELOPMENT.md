# 开发说明

## 结构

```text
src/tool.template.html   前端结构与样式
src/app.js              前端交互
scripts/build.cjs       合并模板、交互及浏览器判定核心
tool.html               可复现的构建结果
probe.cjs               CLI、接口请求和流式响应
runtime.cjs             本机HTTP API、数据归档和计划
queue.cjs               并发、暂停、取消、重试和持久化
core.cjs                糖果结论与HTML提取，兼容Node.js/浏览器
benchmark.cjs           变式、标准答案、统计和基线
visual.cjs              截图、图像评审与质量规则
preview.cjs             隔离播放器
appearance.cjs          本地画面特征比较
insights.cjs            分数解释及参考对照
tests/                  合成样例和本地模拟验证
```

前端调用本机API。生成队列调用用户提供商，视觉队列处理截图和评审，结果实时落盘。只有本机服务运行时后台计划才会执行。

## 验证命令

```sh
npm ci
npm run build
npm run check
npm test
npm run test:visual
```

npm test覆盖28个糖果解析用例、30个变式、双题实际重叠执行、独立评审队列、暂停/取消/重试/恢复、评分快照、画风及新安装状态。所有样例是合成数据，模拟端点只监听本机。

test:visual需已安装的浏览器，测试空白、静止、脚本错误及模拟评分；test:windows需Windows和PowerShell7，测试DPAPI、SSE、定时计划和Key恢复。它们均不调用真实模型。

CI在Linux/Windows和Node.js22/24上运行通用检查，Windows额外检查加密与模拟传输。图像渲染测试在本机按需运行。

## 模块复用

```js
const { judge } = require('./core.cjs');
console.log(judge('candy', '最终答案21颗。另一个条件下需要29颗。'));
```

```sh
node probe.cjs prompts --task candy
node probe.cjs judge --task candy --file answer.txt
```

judge与prompts不请求接口。run会请求你配置的提供商，Key通过MODEL_PROBE_API_KEY注入，禁止在仓库脚本中硬编码。

## 发布

发布前执行build、check和test。源码使用MIT许可证，依赖保留自己的许可证。使用scripts/package-windows.ps1生成干净的Windows包；提供官方Node.js分发目录以附带node.exe及LICENSE。

打包只接受Git已跟踪且通过发布检查的源码，不拷贝本机settings、records、queue、archive、artifacts或portable-state。产物写入dist，校验文件与压缩包一并附到Release；不要上传日常使用目录的个人备份。

没有默认启用的网络检测计划，不在CI配置任何模型Key。修改判定语义时同步规则版本及CHANGELOG，说明历史重判行为。
