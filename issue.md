使用 semantic-release 进行版本修改存在以下问题：

1.   初始化版本号是 1.0.0（在没有tag标记时任何提交都以1.0.0开始，如  1.0.0-beta.1, 1.0.0-alpha.1）
2.   当前封版规则是合入 main，版本修订如下表格：

| 步骤 |                  | main  | beta         | alpha         |
| ---- | ---------------- | ----- | ------------ | ------------- |
| 1    | 初始化           | 1.0.0 | 1.0.0        | 1.0.0         |
| 2    | 新增功能到 alpha | 1.0.0 | 1.0.0        | 1.1.0-alpha.1 |
| 3    | 修复功能到 alpha | 1.0.0 | 1.0.0        | 1.1.0-alpha.2 |
| 4    | 功能合并到 beta  | 1.0.0 | 1.1.0-beta.1 | 1.1.0-beta.1  |
| 5    | 修复功能到 alpha | 1.0.0 | 1.1.0-beta.1 | 1.1.0-alpha.3 |
| 6    | 功能合并到 beta  | 1.0.0 | 1.1.0-beta.2 | 1.1.0-beta.2  |
| 7    | 功能合并到 main  | 1.1.0 | 1.1.0        | 1.1.0         |

3.   在版本号修订并更新到 `package.json`的version后并修改 CHANGELOG.md，此时还需要自己做一个工作流将代码更新给下游分支：`main -> beta -> alpha	`



当前情况：
有尝试过用插件的方式去替代官方 `"@semantic-release/commit-analyzer"` 进行版本确定，也获取到正确的版本号（功能合并到 beta 之后 alpha 再新增的就是下一个版本）如上面表格第 5 步得到的版本号就是 1.2.0-alpha.1，但在后续发布版本的时候还是被改为  1.1.0-alpha.3。

-   问题1：设置了默认版本后在发布的时候还是被修订为 1.0.0
-   问题2：同上，版本还是根据 tag 去修订
-   问题3：可以通过新建一个工作流进行拉取合并（完成，没遇到问题）



## 代码文件

.github/workflows/realease.yml

```yaml
name: Release and Publish

on:
  push:
    branches:
      - main
      - beta
      - alpha

jobs:
  release:
    name: Release and Publish
    runs-on: ubuntu-latest
    permissions:
      contents: write
      issues: write
      pull-requests: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # semantic-release 需要完整的 git 历史
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Git identity and sync branch information
        run: |
          echo "=== 设置 Git 身份 ==="
          git config --global user.email "action@github.com"
          git config --global user.name "GitHub Action"
          
          echo "=== 同步分支信息 ==="
          # 获取所有远程分支最新信息
          git fetch origin main:refs/remotes/origin/main || echo "main 分支不存在"
          git fetch origin beta:refs/remotes/origin/beta || echo "beta 分支不存在" 
          git fetch origin alpha:refs/remotes/origin/alpha || echo "alpha 分支不存在"
          
          # 显示当前分支和远程分支的版本信息
          echo "当前分支: $(git branch --show-current)"
          echo "远程分支信息："
          git log --oneline --graph --all --max-count=10

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.10.0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: pnpm
          registry-url: 'https://registry.npmjs.org'
  
      - name: Cache pnpm modules
        uses: actions/cache@v4
        with:
          path: ~/.local/share/pnpm
          key: pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            pnpm-

      - name: Install dependencies
        run: |
          echo "=== 开始安装依赖 ==="
          pnpm install --frozen-lockfile
          echo "=== 依赖安装完成 ==="

      - name: Build project
        run: |
          echo "=== 开始构建项目 ==="
          if [ -f "package.json" ] && grep -q '"build"' package.json; then
            pnpm run build
            if [ ! -d "dist" ] && [ ! -d "lib" ] && [ ! -d "build" ]; then
              echo "构建目录未找到，但构建命令执行成功"
            fi
          else
            echo "未找到构建脚本，跳过构建步骤"
          fi
          echo "=== 构建完成 ==="

      - name: Run tests (if available)
        run: |
          if [ -f "package.json" ] && grep -q '"test"' package.json; then
            echo "=== 开始运行测试 ==="
            pnpm run test
            echo "=== 测试完成 ==="
          else
            echo "未找到测试脚本，跳过测试步骤"
          fi

      - name: Run semantic-release
        run: |
          echo "=== 开始 semantic-release 流程 ==="
          npx semantic-release
          echo "=== semantic-release 完成 ==="
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

  # 发布成功后的智能同步任务
  sync-branches:
    name: Smart Branch Sync
    runs-on: ubuntu-latest
    needs: release
    if: success()
    permissions:
      contents: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}
          
      - name: Setup Git identity for sync operations
        run: |
          echo "=== 设置 Git 身份用于同步操作 ==="
          git config --global user.email "action@github.com"
          git config --global user.name "GitHub Action"
          
      - name: Smart downstream sync with version alignment
        run: |
          echo "=== 智能下游分支同步 ==="
          current_branch=$(git branch --show-current)
          
          # 获取刚发布的版本号
          latest_tag=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
          echo "最新发布版本: $latest_tag"
          
          case "$current_branch" in
            "main")
              echo "🚀 Main 分支发布完成，同步到 beta 和 alpha"
              
              # 同步到 beta 分支
              git fetch origin beta
              if git show-ref --verify --quiet refs/remotes/origin/beta; then
                git checkout -B beta origin/beta
              else
                git checkout -b beta
              fi
              
              echo "合并 main 到 beta，保持版本一致"
              git merge origin/main --no-edit --no-ff -m "chore: sync main v${latest_tag} to beta [skip ci]" || {
                echo "Beta 合并冲突，强制同步代码但保留版本"
                git reset --hard origin/main
                git commit --allow-empty -m "chore: force sync from main v${latest_tag} [skip ci]"
              }
              
              # 更新 beta 分支的 package.json 版本为正式版本
              if [ -f "package.json" ] && [ -n "$latest_tag" ]; then
                version_without_v=${latest_tag#v}
                sed -i "s/\"version\":\s*\"[^\"]*\"/\"version\": \"$version_without_v\"/" package.json
                git add package.json
                git commit -m "chore: align beta version with main $latest_tag [skip ci]" || echo "No version changes needed"
              fi
              
              git push origin beta --force-with-lease || echo "Beta 推送失败"
              
              # 同步到 alpha 分支
              git fetch origin alpha
              if git show-ref --verify --quiet refs/remotes/origin/alpha; then
                git checkout -B alpha origin/alpha
              else
                git checkout -b alpha
              fi
              
              echo "合并 beta 到 alpha，保持版本一致"
              git merge beta --no-edit --no-ff -m "chore: sync beta to alpha after main release [skip ci]" || {
                echo "Alpha 合并冲突，强制同步"
                git reset --hard beta
                git commit --allow-empty -m "chore: force sync from beta after main v${latest_tag} [skip ci]"
              }
              
              git push origin alpha --force-with-lease || echo "Alpha 推送失败"
              ;;
              
            "beta")  
              echo "🧪 Beta 分支发布完成，同步到 alpha"
              git fetch origin alpha
              
              if git show-ref --verify --quiet refs/remotes/origin/alpha; then
                git checkout -B alpha origin/alpha
              else
                git checkout -b alpha
              fi
              
              echo "合并 beta 到 alpha，保持预发布版本链"
              git merge origin/beta --no-edit --no-ff -m "chore: sync beta v${latest_tag} to alpha [skip ci]" || {
                echo "Alpha 合并冲突，强制同步"
                git reset --hard origin/beta
                git commit --allow-empty -m "chore: force sync from beta v${latest_tag} [skip ci]"
              }
              
              git push origin alpha --force-with-lease || echo "Alpha 推送失败"
              ;;
              
            "alpha")
              echo "🔬 Alpha 分支发布完成，无需同步下游分支"
              echo "Alpha 版本: $latest_tag"
              ;;
              
            *)
              echo "❓ 未知分支 $current_branch，跳过同步"
              ;;
          esac
          
          echo "=== 分支同步完成 ==="
```

