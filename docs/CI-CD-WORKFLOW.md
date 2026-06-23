# 🚀 Project Pulse - CI/CD 工作流

## 完整流程图

```
┌─────────────────────────────────────────────────────────────┐
│  Mavis (AI 助手)                                            │
│  在 /workspace/project-pulse/ 写代码                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  推送代码到 GitHub (Mavis 推送 / 或你接受 patch)                │
│  git push origin feature/some-change                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  GitHub Actions 自动触发 (.github/workflows/ci.yml)            │
│                                                              │
│  ✅ Backend 测试 (pytest)                                      │
│  ✅ Frontend 语法检查 (node --check)                          │
│  ✅ Python 编译检查                                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                  ┌────────┴────────┐
                  │                 │
               通过 ✅           失败 ❌
                  │                 │
                  ▼                 ▼
         ┌──────────────┐    ┌────────────────┐
         │ 可以开 PR     │    │ Mavis 修复后    │
         │              │    │ 再 push         │
         └──────┬───────┘    └────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│  Mavis 创建 Pull Request                                      │
│  PR: feature/xxx → main                                      │
│  自动填好 PR 模板                                              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  你 (Code Owner) 审 PR                                        │
│  - 看 diff                                                     │
│  - 看 CI 状态                                                  │
│  - 留评论 / 改代码 / Approve                                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  点击 "Merge Pull Request"                                   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  GitHub Actions 自动打包 (.github/workflows/release.yml)       │
│  - 生成 project-pulse-20260623-abc1234.zip                   │
│  - 上传到 GitHub Artifacts (保留 30 天)                       │
│  - 通知完成                                                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  你下载新 zip 拖到 update.bat → 自动部署到本地                 │
└─────────────────────────────────────────────────────────────┘
```

## 分支策略 (Branching)

```
main (生产/稳定)
  │
  ├── develop (开发中)
  │     │
  │     ├── feature/sync-improvements
  │     ├── feature/new-chart
  │     └── feature/ui-update
  │
  └── hotfix/urgent-fix (紧急修复)
```

### 实际操作

**Mavis 写代码时**:
```bash
# 我在沙箱里
git checkout -b feature/cloud-sync-v2
# 改代码
git commit -m "Add: 支持 .xls 格式"
git push origin feature/cloud-sync-v2
# 创建 PR: feature/cloud-sync-v2 → main
```

**你审 PR 时**:
1. GitHub 收到 PR 通知
2. 打开 https://github.com/Leo4Jose66/sichuan/pulls
3. 看 "Files changed" 标签
4. 看底部 "Checks" 是不是 ✅
5. 留评论或点 "Approve"
6. 点 "Merge pull request"

## 详细配置步骤

### 1. 推送到 GitHub（已完成前的准备）

```bash
# 第一次推
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:Leo4Jose66/sichuan.git
git push -u origin main
```

### 2. 启用 GitHub Actions

- 推送后 `.github/workflows/*.yml` 自动生效
- 在 GitHub 仓库页面点 "Actions" 标签查看

### 3. 设置分支保护（强烈推荐）

GitHub 仓库 → Settings → Branches → Add rule:

- Branch name pattern: `main`
- ☑ Require a pull request before merging
- ☑ Require approvals: `1` (需要 1 个 Approve)
- ☑ Dismiss stale pull request approvals when new commits are pushed
- ☑ Require status checks to pass before merging
  - 搜索选择 "test-backend" 和 "test-frontend"
- ☑ Require linear history
- ☑ Include administrators (管理员也要走 PR)

### 4. 添加协作者（如果需要）

Settings → Collaborators → Add people → 输入 GitHub 用户名

## 实际工作的样子

### Mavis 推送新代码后

GitHub 会显示在 PR 页面:
```
✅ test-backend / Backend Tests (passed in 1m 23s)
✅ test-frontend / Frontend Syntax (passed in 8s)
✅ summary / Build Summary (passed)
```

### 你合并 PR 后

Actions 标签:
```
✅ Release - Build & Package (passed in 45s)
  └─ 📦 project-pulse-20260623-abc1234.zip (1.2 MB)
```

下载链接在 Action run 详情里。

## 我作为 Mavis 怎么操作

未来给你更新代码时,我会在沙箱里:

1. **改代码** (我的工作目录 /workspace/project-pulse)
2. **测试** (本地跑)
3. **生成 patch 文件** (`git diff > update-xxx.patch`)
4. **或者直接 git push** (如果你给了我一个有 push 权限的 token)
5. **生成 PR** (用 gh CLI)

**最佳实践是 #3 (patch)**,这样你可以审一眼再决定要不要用。

## 安全考虑

- ❌ 不要把 SSH 私钥 / PAT 写到任何地方(配置文件除外)
- ✅ 用 GitHub Secrets 存 PAT(将来如果需要)
- ✅ 启用 2FA
- ✅ 定期 review collaborator 列表

## 故障排查

| 问题 | 解决 |
|---|---|
| Actions 不触发 | 检查 `.github/workflows/*.yml` 语法,YAML indent 必须 2 空格 |
| CI 失败 | 点 "Details" 看具体哪步出错 |
| PR 不能 merge | 检查 Branch protection 是否挡住,需要先 Approve |
| Patch 应用失败 | `git stash` 后再 apply,或 `git apply -R` 回滚 |

## 进阶:自动通知

可以在 CI 完成后发飞书/钉钉/邮件通知,需要:

1. 创建 webhook URL
2. 在 GitHub 仓库 Settings → Secrets 添加
3. 在 workflow 里 curl 调用

需要的话我帮你加。
