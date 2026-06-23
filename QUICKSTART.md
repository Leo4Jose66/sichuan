# 🚀 Project Pulse 上手指南

> 3 步跑起来,5 分钟看到效果

## 第一步:解压

把 `project-pulse.zip` 解压到任意目录,例如:
- Windows: `C:\project-pulse\`
- Mac/Linux: `~/project-pulse/`

## 第二步:启动

### Windows
双击运行 `start.bat`

或者命令行:
```cmd
cd project-pulse
start.bat
```

### Mac / Linux
```bash
cd project-pulse
chmod +x start.sh
./start.sh
```

脚本会自动:
- 检测 Python 环境
- 安装依赖(首次约 1-2 分钟)
- 启动服务

## 第三步:打开浏览器

访问: **http://localhost:8000**

页面会自动加载 200 条演示数据,你立刻就能看到完整的看板效果。

---

## 验证服务跑起来了

启动成功后,终端会显示:
```
✅ 服务地址: http://localhost:8000
📖 API 文档: http://localhost:8000/docs
INFO:     Uvicorn running on http://0.0.0.0:8000
```

如果浏览器打不开:
1. 检查终端有没有报错
2. 确认 8000 端口没被占用(`netstat -ano | findstr 8000` / `lsof -i :8000`)
3. 试一下 `http://127.0.0.1:8000`

---

## 常见问题

### Q: 没有 Python?
去 https://www.python.org/downloads/ 装一个 **Python 3.10+**(Windows 安装时勾上"Add to PATH")。

### Q: pip install 太慢?
换源:
```bash
# Mac/Linux
pip install -r backend/requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple/

# Windows
pip install -r backend\requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple/
```

### Q: 想换端口?
编辑 `start.sh` / `start.bat` 里的 `--port 8000`,改成 `--port 9000` 之类。

### Q: 想用真实数据?
打开页面 → 右上角"导入 Excel" → 拖拽上传你的表格即可。

### Q: 想清掉演示数据换真实的?
页面右上角"更多 → 重置演示数据",会清空 + 重新生成。或者直接导入 Excel 覆盖。

### Q: 怎么停服务?
终端里按 `Ctrl + C`。

---

## 下一步:导入你的真实数据

1. 把当前的 Excel 整理一下,确认列名(序号、人员、软件预算规模、云资源量级（w）、把握度 等)
2. 如果列名不一样,改 `backend/field_mapping.yaml` 对应行的 `excel:` 字段
3. 页面右上角点"导入 Excel",拖拽上传
4. 系统提示"成功导入 X 条" → 自动刷新看板

如果导入有问题,看终端日志,通常会告诉你哪一行哪一列不对。

---

## 搞不定找我

随时截图/贴报错给我,我帮你看 💪