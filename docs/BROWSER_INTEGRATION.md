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

宿主应用负责登录、用户Key选择、历史存储和批次生命周期。Key只作为请求参数传入，结果对象不包含Key；接口请求不带浏览器Cookie、不跟随重定向。推荐只允许当前站点的网关地址，不接受跨站消息自动配置Key。

Chat Completions和Responses均支持SSE。Responses流只有收到明确的完成事件才会记为完成；中途断流保留回答并标为待复核，不计作通过。HTTP错误、超时和取消分别保留，原有糖果判定规则未改变。

生成HTML必须放进`sandbox="allow-scripts"`的iframe，禁止`allow-same-origin`。可使用`playerDocument`生成固定画布尺寸、禁止外网请求的播放器。浏览器模块只提供作品结构检查，不把结构完整视为视觉质量通过。

如果宿主使用nonce型CSP，直接设置srcdoc会继承宿主的脚本限制。此时通过同源静态URL提供`browser/player.html`，响应必须包含`Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts`。宿主iframe仍只设置`allow-scripts`，加载后将`{ type: 'model-probe:render', html: playerDocument(artifact) }`通过该iframe的contentWindow发送。沙箱来源不透明，因此发送目标为`'*'`，接收端严格核对发送窗口和宿主origin；消息仅含生成作品，禁止包含Key。不要全站放宽CSP。

站内版支持手动批次和本浏览器历史。自动截图、视觉评分、后台定时和重启恢复继续由原版Node.js服务提供；不要把原版单用户控制API直接暴露给多个网站用户。关闭检测页应取消当前请求，切换账号应清空内存并打开对应用户的数据空间。
