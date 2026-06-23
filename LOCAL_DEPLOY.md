# Project Pulse · 本地部署指南

> 把看板部署到本地/内网服务器，支持 Excel 上传实时更新数据。

## 🚀 一键启动

```bash
# 1. 进入项目目录
cd project-pulse

# 2. 启动服务(首次会自动安装依赖)
bash start-local.sh
```

启动后访问：**http://localhost:8765**

端口/主机可通过环境变量自定义：
```bash
PORT=9000 HOST=127.0.0.1 bash start-local.sh
```

## 📦 系统要求

- **Python 3.9+**（3.10/3.11/3.12 均测试通过）
- **磁盘**：≥200 MB（含依赖、演示数据、SQLite）
- **内存**：≥256 MB
- **网络**：首次安装需联网（拉 pip 包）

## 🐳 Docker 部署

```bash
docker-compose up -d
# 访问 http://localhost:8765
```

## 📁 目录结构

```
project-pulse/
├── start-local.sh         # 一键启动脚本
├── backend/               # FastAPI 后端
│   ├── app/               # 业务代码
│   │   ├── main.py        # 入口
│   │   ├── routes.py      # API 路由
│   │   ├── importer.py    # Excel 解析
│   │   ├── analytics.py   # 聚合分析
│   │   └── seed.py        # 演示数据生成
│   ├── data/              # 持久化数据
│   │   ├── project_pulse.db    # SQLite 数据库
│   │   └── uploads/            # 上传的 Excel 备份
│   ├── field_mapping.yaml # Excel 字段映射
│   └── requirements.txt
├── frontend/              # Vue 3 前端（被后端挂载）
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── vendor/            # 本地化 Vue/ElementPlus/ECharts
│   └── data/
└── docker-compose.yml
```

## 📊 Excel 上传规范

1. 点击顶部 **「导入 Excel」** 按钮
2. 拖入或选择 `.xlsx`/`.xls` 文件
3. 上传完成后自动刷新全看板

**字段映射**（`backend/field_mapping.yaml` 可改）：

| 系统字段 | Excel 列名 | 类型 |
|---|---|---|
| project_no | 序号 | string |
| opportunity_name | 机会点名称 | string |
| customer | 客户 | string |
| owner | 人员 | string |
| partner | 伙伴名称 | string |
| industry | 行业 | string |
| track | 赛道 | string |
| deployment_mode | 部署方式 | string |
| stage | 项目阶段 | string |
| confidence | 把握度 | string |
| po_ho | PO/HO | string |
| predict_month | 预测下单月份 | string (YYYY-MM) |
| software_budget | 软件预算规模 | number |
| cloud_budget | 云资源量级（w） | number |

> **导入模式：覆盖** — 每次上传会清空旧数据，替换为新 Excel 里的内容。

## 🔌 API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查 + 数据条数 |
| GET | `/api/data` | 完整数据(前端用) |
| GET | `/api/kpi` | 顶部 KPI 汇总 |
| GET | `/api/dim/time` | 月度趋势 |
| GET | `/api/dim/{dim}` | 维度分析(partner/predict_month 等) |
| GET | `/api/projects` | 项目明细(支持筛选+排序+分页) |
| GET | `/api/projects/export` | 导出 CSV |
| POST | `/api/import` | 上传 Excel |
| POST | `/api/seed?count=200` | 重新生成 N 条演示数据 |
| GET | `/api/batches` | 导入历史 |
| POST | `/api/config/reload` | 热加载 field_mapping |

## 🛠️ 常见问题

**Q: 端口被占用？**
A: 换端口：`PORT=9000 bash start-local.sh`

**Q: 想重置成演示数据？**
A: 浏览器访问 `http://localhost:8765/api/seed?count=200` 或在 UI 顶部「更多」→「重置演示数据」

**Q: Excel 字段名和文档不一致？**
A: 编辑 `backend/field_mapping.yaml`，重启服务生效

**Q: 数据库清空？**
A: 删除 `backend/data/project_pulse.db` 后重启，自动用演示数据重建

**Q: 部署到内网服务器？**
A: 把 `HOST=0.0.0.0` 启动，开放 8765 端口即可

## 🆕 升级前端

如需改前端样式/逻辑：
1. 修改 `frontend/app.js`、`frontend/styles.css`
2. 刷新浏览器（无需重启后端，HTML/JS/CSS 静态资源直接加载）

## 🛑 停止服务

```
Ctrl + C   （前台运行时）
pkill -f uvicorn   （后台运行时）
```
