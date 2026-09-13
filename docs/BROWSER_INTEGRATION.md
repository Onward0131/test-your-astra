# 浏览器和Sub2API集成

`browser/model-probe.mjs`是无Node.js依赖的ES模块，由同一份`core.cjs`、`transport.cjs`和`preview.cjs`生成；对应类型为`browser/model-probe.d.mts`。执行`npm run build`重建，`npm run check`验证产物。

```js
import { runProbe, playerDocument } from './browser/model-probe.mjs';

const controller = new AbortController();
const record = await runProbe({
  baseUrl: location.origin + '/v1',
  apiKey: selectedUserKey,
  model: selectedModel,
  task: 'candy',
  protocol: 'responses',
}, controller.signal);
```

宿主应用负责登录、用户Key选择、历史存储和批次生命周期。Key只作为请求参数传入，结果对象不包含Key；接口请求不带浏览器Cookie、不跟随重定向。本站Key固定发往本站网关。需要测其他站点时，提供单独的API地址、外站Key和模型输入框，不接受跨站消息自动配置Key。

Sub2API集成同时支持本站和其他站点。外站可使用`fetchImpl`接入同源登录保护的流式转发接口：`runProbe`仍传真实目标`baseUrl`，以便结果保留正确的站点地址；`fetchImpl`只将请求体、独立外站Key、固定操作名发给宿主后台，并原样返回`Response`供SDK读取SSE。模型列表可以选填，允许直接输入目标模型。外站费用由目标提供商按外站Key结算。

转发层只开放模型列表、Responses和Chat Completions，禁止转发本站会话和Cookie、跟随重定向或访问内网；域名应在连接时解析并校验后直接连接该IP，避免DNS变化绕过验证。限制并发、请求体、响应体与超时，客户端取消必须传递到上游。外站401与宿主登录401应明确区分，不能因外站Key错误刷新宿主会话或重发付费请求。含Key的转发请求体不应写进审计或调试日志。

外站Key只留在页面内存，不随历史、导出或跨窗口消息保存。历史可记录规范化后的目标地址；切换地址应清空原Key，复测不同站点时要求重新输入对应Key。请求设置中的`tokenField`支持`max_tokens`和`max_completion_tokens`，用于兼容不同Chat接口。

Chat Completions和Responses均支持SSE。Responses流只有收到明确的完成事件才会记为完成；中途断流保留回答并标为待复核，不计作通过。HTTP错误、超时和取消分别保留，原有糖果判定规则未改变。

生成HTML必须放进`sandbox="allow-scripts"`的iframe，禁止`allow-same-origin`。可使用`playerDocument`生成固定画布尺寸、禁止外网请求的播放器。浏览器模块只提供作品结构检查，不把结构完整视为视觉质量通过。

如果宿主使用nonce型CSP，直接设置srcdoc会继承宿主的脚本限制。此时通过同源静态URL提供`browser/player.html`，响应必须包含`Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts`。宿主iframe仍只设置`allow-scripts`，加载后将`{ type: 'model-probe:render', html: playerDocument(artifact) }`通过该iframe的contentWindow发送。沙箱来源不透明，因此发送目标为`'*'`，接收端严格核对发送窗口和宿主origin；消息仅含生成作品，禁止包含Key。不要全站放宽CSP。

站内版支持手动批次和本浏览器历史。自动截图、视觉评分、后台定时和重启恢复继续由原版Node.js服务提供；不要把原版单用户控制API直接暴露给多个网站用户。关闭检测页应取消当前请求，切换账号应清空内存并打开对应用户的数据空间。
