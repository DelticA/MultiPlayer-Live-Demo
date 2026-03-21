# MultiPlayer Live Demo

一个基于 Gabriel Gambetta 的网络同步示例改造的演示项目：

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


## 操作方式

- 按住 `A / D`
- 或按住键盘左右方向键
- 按住 `S`
- 或按住键盘下方向键

## 参考来源

- [Gabriel Gambetta - Fast-Paced Multiplayer: Sample Code and Live Demo](https://www.gabrielgambetta.com/client-side-prediction-live-demo.html)
- [Gabriel Gambetta - Client-Side Prediction and Server Reconciliation](https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html)
- [Gabriel Gambetta - Entity Interpolation](https://www.gabrielgambetta.com/entity-interpolation.html)
