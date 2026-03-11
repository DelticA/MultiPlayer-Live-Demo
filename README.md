# MultiPlayer Live Demo

一个基于 Gabriel Gambetta 经典网络同步示例改造的前端演示项目，目标是把原本偏“对等客户端”的说明性 demo，重构成更贴近实际多人同步架构的三视图版本：

- `Authoritative Server`：权威服务器状态
- `Controller`：主控端本地预测与服务器和解
- `Simulator`：模拟端基于快照缓冲的插值渲染

当前仓库提供的是一个拆分为 `HTML + CSS + JavaScript module` 的前端演示页面，用来直观观察以下三个核心机制如何协同工作：

- Client-Side Prediction
- Server Reconciliation
- Entity Interpolation

## 项目内容

- `index.html`：页面结构和控件
- `styles.css`：布局、视觉样式和响应式规则
- `network.js`：网络模型、同步状态和预测/和解/插值逻辑
- `render.js`：canvas 绘制和高 DPI 适配
- `ui.js`：DOM、输入绑定、主循环和页面初始化
- `.github/workflows/pages.yml`：GitHub Pages 自动部署工作流

这个页面保留了 Gambetta 示例中最核心的建模思路：

- `LagNetwork`：模拟单向延迟、抖动和丢包
- `Server`：处理输入并定频广播快照
- `ControllerClient`：主控端输入立即本地生效，收到 ACK 后回滚重放未确认输入
- `SimulatorClient`：远端观察者不预测，只根据服务器快照做插值

## 与原始示例的差异

相对于原始 live demo，这个版本主要做了这些调整：

- 从双客户端并列演示，改为 `server / controller / simulator` 三视图
- 把“主控端即时响应”和“远端观察平滑插值”拆成两个独立职责
- 增加更直观的调试信息，包括：
  - 主控端待确认输入数量
  - 服务器 ACK 序号
  - 主控预测位置与服务器幽灵位置偏差
  - 模拟端插值缓冲长度
- 支持在界面上实时调整：
  - 单向延迟
  - 网络抖动
  - 丢包率
  - 服务器快照频率
  - 模拟端插值延迟

## 如何运行

这是一个纯前端静态 demo，不依赖构建工具。

由于页面现在使用 ES modules，建议通过本地静态服务器运行，而不是直接双击 `index.html`。

示例：

```bash
python3 -m http.server 8123
```

然后访问：

- `http://127.0.0.1:8123`

操作方式：

- 按住 `A / D`
- 或按住键盘左右方向键

## 观察建议

建议先从以下参数开始：

- 延迟：`120ms`
- 抖动：`25ms`
- 丢包：`0%`
- 快照频率：`10Hz`
- 插值延迟：`180ms`

重点观察：

- 主控端为什么会先于服务器状态移动
- 服务器 ACK 返回后，主控端如何通过未确认输入重放恢复“当前”位置
- 模拟端为什么故意落后一点时间，但画面更平滑

## 参考来源

- [Gabriel Gambetta - Fast-Paced Multiplayer: Sample Code and Live Demo](https://www.gabrielgambetta.com/client-side-prediction-live-demo.html)
- [Gabriel Gambetta - Client-Side Prediction and Server Reconciliation](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html)
- [Gabriel Gambetta - Entity Interpolation](https://www.gabrielgambetta.com/entity-interpolation.html)

## 后续方向

这个仓库目前还是初版，下一步适合继续扩展的方向包括：

- 把主控端位置拆成 `predicted / authoritative / corrected smoothing`
- 增加多个远端实体，演示统一插值管线
- 接入真实 websocket 通信替代本地 `LagNetwork`

## GitHub Pages

仓库已经包含 GitHub Pages 工作流，推送到 `main` 后会自动触发部署。

默认访问地址会是：

- [MultiPlayer Live Demo Pages](https://deltica.github.io/MultiPlayer-Live-Demo/)

如果仓库还没有把 Pages 发布源切到 `GitHub Actions`，需要在仓库设置里做一次：

- `Settings` -> `Pages` -> `Build and deployment` -> `Source: GitHub Actions`
