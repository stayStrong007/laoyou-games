# 佬友的游戏屋 | Laoyou Games

收录 Linux DO 佬友们搓出来的快乐。这是一个人工收录的网页小游戏导航站：只收录链接、不托管游戏，评论和讨论都回到 Linux DO 原帖。

## 目录

```text
public/                  静态站点（Cloudflare Pages 的输出目录）
  index.html             主页面：样式、像素图标、筛选搜索、点赞、投稿弹窗都在这一个文件里
  games.json             游戏数据
  og-image.png           链接预览图（1200×630）
  favicon.svg            网站图标
  fonts/                 截取过的像素字体和授权文件
  covers/                站长转存的封面（可选）
functions/api/likes.js   点赞接口（Pages Function + D1）
schema.sql               D1 建表语句
wrangler.toml            Pages 配置：输出目录、D1 绑定
LICENSE                  代码许可证（MIT）
scripts/
  validate.mjs           games.json 校验，也是 Pages 的构建命令
  subset-fonts.py        像素字体截取
  og-image.html          链接预览图的设计源文件
```

## 本地预览

只看页面。这时没有点赞接口，页面会自动隐藏喜爱数，点赞只记在本机：

```bash
python -m http.server 8788 --directory public
```

然后打开 <http://localhost:8788>。如果 `games.json` 还是空数组，页面会显示"还没有收录游戏"。

要连同点赞接口一起调试，用 wrangler（需要 Node.js，第一次运行会下载 wrangler）：

```bash
npx wrangler d1 execute laoyou-games --local --file=schema.sql
```

```bash
npx wrangler pages dev
```

## 部署到 Cloudflare Pages

全部在 Cloudflare 控制台里操作，不需要在本地装 wrangler。控制台改版后菜单名称可能略有不同，按意思找就行。

1. **创建 D1 数据库**：左侧菜单"存储和数据库 → D1 SQL 数据库"，点"创建数据库"，名称填 `laoyou-games`。创建后，在数据库详情页复制"数据库 ID"。
2. **建表**：在这个数据库的"控制台"（Console）标签页里，把 `schema.sql` 的全部内容粘贴进去，点"执行"（Execute）。里面有两条建表语句，一次执行就行。执行后在"表"里能看到 `likes` 和 `like_counts` 两张表。
3. **改配置并推送**：
   - 把 `wrangler.toml` 里的 `database_id` 换成第 1 步复制的 ID。
   - 把 `public/index.html` 里这几处换成你自己的：`CONFIG.repoUrl`（GitHub 仓库地址）、`CONFIG.forumThread`（宣传主帖地址，可以等发帖后再改），以及 `<head>` 里 `og:url`、`og:image` 的域名。

   仓库里现在填的是本站自己的配置。如果你是 fork 这个仓库去部署自己的站点，上面这几处都要换成你自己的。
   - 提交并推送到 GitHub。
4. **创建 Pages 项目**：左侧菜单"Workers 和 Pages"，点"创建"，选 Pages 里的"连接到 Git"，选中这个仓库，然后：
   - 项目名称：`laoyou-games`，和 `wrangler.toml` 里的 `name` 保持一致
   - 生产分支：`main`
   - 框架预设：无
   - 构建命令：`node scripts/validate.mjs`
   - 构建输出目录：`public`

   D1 绑定 `DB` 由 `wrangler.toml` 声明，不用在控制台另外添加。
5. **添加机密 `IP_SALT`**：Pages 项目的"设置 → 变量和机密"里添加一个变量，类型选"密钥"，名称 `IP_SALT`，值随便填一串较长的随机字符。点赞记录里存的 IP 哈希会用它加盐。机密在下次部署后才生效，所以添加后到"部署"里点一次"重新部署"。如果控制台不让添加，就在项目根目录运行 `npx wrangler pages secret put IP_SALT --project-name laoyou-games`，按提示登录 Cloudflare 后输入值（需要 Node.js）。
6. **绑定域名**：Pages 项目的"自定义域"里添加你的二级域名，按提示确认 DNS 记录。`pages.dev` 在国内访问不稳，不要对外使用。
7. **速率限制**：进入这个域名所在的区域，"安全性 → WAF → 速率限制规则"里新建一条：URI 路径等于 `/api/likes`，按 IP 计数，10 秒内超过 20 次就阻止 10 秒。免费版只能建一条。
8. **检查**：
   - 打开 `https://你的域名/api/likes`，应该返回 `{}`。如果报错，多半是 `database_id` 没填对，或者建表没成功。
   - 首页能正常打开。还没收录游戏时，会显示"还没有收录游戏"。

之后每次推送到 `main`，Pages 都会先跑校验脚本，通过了才部署；校验失败时线上保持上一个版本。

## 投稿

投稿、修改、下架、反馈都在 Linux DO 的宣传主帖里回帖提交，网站上的"投稿"按钮里有现成的模板。只收浏览器里点开就能玩、免费、不强制注册的游戏，并且只收作者本人的投稿。

这个仓库欢迎针对网站代码和文档的 Issue 与 Pull Request，但不接受投稿：在 GitHub 上没法核对提交者是不是作者本人，所以直接修改 `games.json` 的 Pull Request 不会合并，游戏数据只通过主贴处理。

## 改了固定文案之后

Logo、标语、弹窗标题和预览图上的文字用的是截取过的像素字体，只包含用到的字。改了这些文字，要重新截取字体、重新生成预览图：

1. 准备字体源文件（只需一次）：
   - 缝合像素字体：[Releases](https://github.com/TakWolf/fusion-pixel-font/releases) 里的 `fusion-pixel-font-12px-proportional-otf.woff2-*.zip`，解压出 `fusion-pixel-12px-proportional-zh_hans.otf.woff2`
   - Press Start 2P：[PressStart2P-Regular.ttf](https://github.com/google/fonts/tree/main/ofl/pressstart2p)
2. 截取字体（需要 `pip install fonttools brotli`）：
   ```bash
   python scripts/subset-fonts.py --fusion 缝合像素字体文件路径 --press-start PressStart2P-Regular.ttf路径
   ```
3. 重新生成预览图。Windows 下用 Edge，在 PowerShell 里运行：
   ```powershell
   & "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --hide-scrollbars --force-device-scale-factor=1 --allow-file-access-from-files --virtual-time-budget=4000 --user-data-dir="$env:TEMP\og-edge" --window-size=1200,630 --screenshot="$PWD\public\og-image.png" "file:///$($PWD.Path.Replace('\','/'))/scripts/og-image.html"
   ```
   macOS / Linux 把程序换成 Chrome，参数相同。

## 授权

- **代码**：采用 [MIT 许可证](LICENSE)，网站自己的图标和预览图也包含在内。
- **收录的游戏**：游戏名称、简介、截图等内容归各自的作者所有，不在 MIT 许可证范围内。
- **像素字体**：两款都是 SIL Open Font License 1.1 授权，授权文件在 `public/fonts/LICENSES/`：
  - [缝合像素字体](https://github.com/TakWolf/fusion-pixel-font)（Fusion Pixel Font），© TakWolf
  - [Press Start 2P](https://github.com/google/fonts/tree/main/ofl/pressstart2p)，© The Press Start 2P Project Authors。它的授权保留了字体名，所以截取后的文件改名为 LG Arcade；缝合像素字体截取后改名为 LG Pixel
