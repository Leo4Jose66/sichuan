# Project Pulse · 项目规模分析平台

> 部门级项目统计分析工具,基于多维度(把握度/时间/伙伴/PO-HO/行业)展示项目数量与金额,辅助销售决策。

## ✨ 核心功能

- **6 个 KPI 卡**:项目总数 / 已签单 / 漏斗价值 / 风险项目 / 赢率 / 平均单笔
- **5 类维度图表**:把握度分布 / 时间趋势 / 伙伴排行 / PO-HO 占比 / 行业雷达
- **点击下钻**:任意图表柱子 → 自动筛选 → 跳转明细表
- **多维筛选**:把握度 / 伙伴 / PO-HO / 行业 / 月份 / 关键词搜索
- **Excel 导入**:拖拽上传,自动按字段映射入库
- **CSV 导出**:当前筛选结果一键导出
- **演示数据**:启动自动生成 200 条覆盖各维度的假数据

## 🚀 快速启动

### 方式一:本地 Python(开发推荐)

```bash
# 进入项目目录
cd project-pulse

# 一键启动(自动装依赖)
./start.sh
```

访问 **http://localhost:8000**

### 方式二:Docker(生产部署)

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止
docker-compose down
```

数据持久化在 `./data/` 目录,卸载容器不丢数据。

## 📁 项目结构

```
project-pulse/
├── backend/                # FastAPI 后端
│   ├── app/
│   │   ├── main.py         # 入口 + 静态挂载
│   │   ├── config.py       # 配置
│   │   ├── database.py     # 数据库连接
│   │   ├── models.py       # 数据模型
│   │   ├── schemas.py      # API 模式
│   │   ├── routes.py       # API 路由
│   │   ├── analytics.py    # 分析聚合
│   │   ├── importer.py     # Excel 解析
│   │   ├── seed.py         # 演示数据生成
│   │   └── static.py       # 前端挂载
│   ├── field_mapping.yaml  # 🔑 字段映射配置(业务改这里)
│   ├── requirements.txt
│   └── data/               # 数据库 + 上传文件
├── frontend/               # Vue 3 前端(CDN,无需构建)
│   ├── index.html
│   ├── app.js              # Vue 主应用
│   └── styles.css          # 暗色仪表盘主题
├── docs/
├── Dockerfile
├── docker-compose.yml
├── start.sh
└── README.md
```

## 🔌 API 文档

启动后访问 **http://localhost:8000/docs**(Swagger UI)或 **http://localhost:8000/redoc**(ReDoc)。

### 核心接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/kpi` | GET | 顶部 KPI 汇总 |
| `/api/dim/confidence` | GET | 按把握度聚合 |
| `/api/dim/time` | GET | 按月份趋势(start/end 可选) |
| `/api/dim/partner` | GET | 按伙伴聚合(top_n 可选) |
| `/api/dim/po_ho` | GET | 按 PO/HO 聚合 |
| `/api/dim/industry` | GET | 按行业聚合 |
| `/api/dim/track` | GET | 按赛道聚合 |
| `/api/dim/stage` | GET | 按项目阶段聚合 |
| `/api/projects` | GET | 项目明细(支持筛选+分页+排序) |
| `/api/projects/export` | GET | 导出 CSV |
| `/api/import` | POST | Excel 上传导入 |
| `/api/seed` | POST | 生成演示数据 |
| `/api/options` | GET | 筛选下拉字典 |
| `/api/batches` | GET | 导入批次历史 |
| `/api/config/reload` | POST | 重载字段映射 |

## 🔧 业务字段变更

业务侧 Excel 表头变化时,**无需改代码**,只需修改 `backend/field_mapping.yaml`:

```yaml
fields:
  owner:
    excel: "人员"            # ← 改成业务侧最新的列名
    type: string
    label: "负责人"

  # 新增字段示例
  product_line:
    excel: "产品线"          # ← 新加一行
    type: string
    label: "产品线"
```

改完执行 `curl -X POST http://localhost:8000/api/config/reload` 即可热加载。

## 📊 数据格式约定

### Excel 表头(导入时识别)

参考原表字段定义,例如:

| 列名 | 示例值 |
|------|--------|
| 序号 | PRJ-2026-001 |
| 人员 | 张磊 |
| 软件预算规模 | 1583.75 |
| 云资源量级（w） | 1054.74 |
| 把握度 | 已下单 / 保底 / 机会 / 风险 / 关闭 |
| 预测下单月份 | 2026-07 |
| PO/HO | PO / HO |
| 伙伴名称 | 中软国际 |
| 行业 | 制造 / 政府 / 金融 |

金额单位:**万元**。

### 派生字段

系统自动计算:
- `scale_amount = software_budget + cloud_budget`(项目总规模)
- `is_signed = confidence == '已下单'`
- `is_at_risk = confidence == '风险'`

## 🧪 演示数据

- 200 条项目,覆盖 9 个行业、20 个伙伴、8 个赛道、5 个把握度档位
- 金额分布遵循头部 20% 占 60% 的长尾规律
- 行业典型金额区间按真实业务设定(金融/政府 > 制造/医药 > 互联网)

重置数据:右上角"更多 → 重置演示数据"。

## 🛠️ 常见操作

### 修改某个图表

打开 `frontend/app.js`,找到对应的 `renderXxxChart()` 函数,ECharts 配置项直接改。

### 加一个新维度

1. `backend/app/analytics.py` 的 `DIM_FIELDS` 加一行
2. 前端 `frontend/app.js` 的 `loadDimensions()` 加一个 fetch
3. 加一个 `renderXxxChart()` 函数和模板位置

### 接入真实 Excel

1. 准备好 Excel(表头按 `field_mapping.yaml` 的 `excel:` 字段)
2. 页面右上角"导入 Excel"→ 拖拽上传
3. 系统自动覆盖当前数据并入库

## 🐛 故障排查

| 现象 | 原因 | 解决 |
|------|------|------|
| 启动报 `No module named 'app'` | 启动目录不对 | 在 `backend/` 目录下启动,或用 `start.sh` |
| 导入 Excel 后无数据 | 字段映射不对 | 检查 `field_mapping.yaml` 的 `excel:` 列名是否匹配 |
| 图表显示空白 | ECharts 未加载 | 检查浏览器控制台,确认 CDN 可访问 |
| 端口被占用 | 8000 已被占 | 改 `docker-compose.yml` 的端口映射 |

## 📝 后续路线图

- [ ] 历史快照对比(本月 vs 上月)
- [ ] 定时任务(每日自动读取共享盘)
- [ ] 权限管理(部门 / 个人视图隔离)
- [ ] 邮件 / 钉钉周报自动生成
- [ ] 项目阶段漏斗(SS1 → SS8 转化率)

## 📄 许可证

内部使用工具,未授权外部分发。