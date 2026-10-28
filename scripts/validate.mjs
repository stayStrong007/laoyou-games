// 校验 public/games.json。它也是 Cloudflare Pages 的构建命令：
// 发现错误时以非 0 退出，部署失败，线上保持上一个版本，坏数据不会上线。
// 用法：node scripts/validate.mjs [要校验的 json 路径]
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = join(ROOT, "public");
const FILE = resolve(process.argv[2] ?? join(PUBLIC_DIR, "games.json"));

const TAGS = ["摸鱼必备", "经典重制", "脑洞大开", "硬核挑战"];
const REQUIRED = ["id", "title", "desc", "tag", "playUrl", "author", "postUrl", "addedAt"];
const OPTIONAL = ["cover", "authorAvatar", "mobile", "madeWith", "repoUrl"];
const KNOWN = new Set([...REQUIRED, ...OPTIONAL]);
const DESC_LIMIT = 40;
const TODAY = new Date().toISOString().slice(0, 10);

// 上线前要替换掉的占位值：[在 index.html 里搜的文字, 说明]
const PLACEHOLDERS = [
  ["https://linux.do/t/topic/0", "宣传主帖地址（CONFIG.forumThread）"],
  ["your-name/laoyou-games", "GitHub 仓库地址（CONFIG.repoUrl）"],
  ["games.example.com", "站点域名（og:url / og:image）"],
];

const errors = [];
const warnings = [];

function httpsUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

const isLdstatic = (url) => url.hostname === "ldstatic.com" || url.hostname.endsWith(".ldstatic.com");

function isRealDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function checkCover(cover, err) {
  if (typeof cover !== "string" || cover === "") {
    err('cover 不能是空值，不需要封面就删掉这个字段');
    return;
  }
  if (cover.startsWith("covers/")) {
    const path = normalize(join(PUBLIC_DIR, cover));
    if (cover.includes("..") || !path.startsWith(join(PUBLIC_DIR, "covers"))) err(`cover "${cover}" 路径不合法`);
    else if (!existsSync(path)) err(`cover 指向的文件 public/${cover} 不存在`);
    return;
  }
  const url = httpsUrl(cover);
  if (!url || !isLdstatic(url)) err("cover 只允许 *.ldstatic.com 的 https 链接，或仓库里的 covers/ 路径");
}

function checkGame(game, label) {
  const err = (msg) => errors.push(`${label}：${msg}`);
  const warn = (msg) => warnings.push(`${label}：${msg}`);

  for (const key of Object.keys(game)) {
    if (!KNOWN.has(key)) err(`未知字段 "${key}"（是不是拼错了？）`);
  }
  for (const key of REQUIRED) {
    if (game[key] === undefined || game[key] === null || game[key] === "") err(`缺少必填字段 "${key}"`);
  }
  for (const key of ["title", "desc", "author", "madeWith"]) {
    if (game[key] !== undefined && typeof game[key] !== "string") err(`"${key}" 应该是字符串`);
  }

  if (game.tag !== undefined && !TAGS.includes(game.tag)) err(`分类 "${game.tag}" 不在 ${TAGS.join(" / ")} 里`);
  if (game.addedAt !== undefined) {
    if (!isRealDate(game.addedAt)) err(`addedAt "${game.addedAt}" 不是有效的 YYYY-MM-DD 日期`);
    else if (game.addedAt > TODAY) warn(`addedAt ${game.addedAt} 晚于今天`);
  }
  for (const key of ["playUrl", "postUrl", "repoUrl"]) {
    if (game[key] !== undefined && game[key] !== "" && !httpsUrl(game[key])) err(`"${key}" 必须是 https 链接`);
  }
  if (httpsUrl(game.postUrl) && !game.postUrl.startsWith("https://linux.do/t/")) err("postUrl 必须以 https://linux.do/t/ 开头");
  if (game.cover !== undefined) checkCover(game.cover, err);
  if (game.authorAvatar !== undefined) {
    const url = httpsUrl(game.authorAvatar);
    if (!url || !isLdstatic(url)) err("authorAvatar 只允许 *.ldstatic.com 的 https 链接");
  }
  if (game.mobile !== undefined && typeof game.mobile !== "boolean") err("mobile 只能是 true 或 false（不带引号）");
  if (typeof game.author === "string" && /[\s/@]/.test(game.author)) err("author 填 Linux DO 用户名本身，不带 @、空格或斜杠");
  if (typeof game.desc === "string" && [...game.desc].length > DESC_LIMIT) {
    warn(`简介有 ${[...game.desc].length} 个字，超过建议的 ${DESC_LIMIT} 字，卡片上会被截断`);
  }
}

function checkPlaceholders() {
  const html = join(PUBLIC_DIR, "index.html");
  if (!existsSync(html)) return;
  const text = readFileSync(html, "utf8");
  for (const [needle, what] of PLACEHOLDERS) {
    if (text.includes(needle)) warnings.push(`index.html：${what} 还是占位值，上线前记得替换`);
  }
}

function finish(nextId, active, removed) {
  if (warnings.length) {
    console.log(`提醒（不影响部署）：\n${warnings.map((w) => `  - ${w}`).join("\n")}\n`);
  }
  if (errors.length) {
    console.error(`games.json 校验失败，共 ${errors.length} 个错误：\n${errors.map((e) => `  - ${e}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`games.json 校验通过：${active} 款游戏，${removed} 个下架占位。下一个可用 id：${nextId}`);
}

let data;
try {
  data = JSON.parse(readFileSync(FILE, "utf8"));
} catch (e) {
  errors.push(`读不出 ${FILE}：${e.message}`);
  finish(1, 0, 0);
}
if (!Array.isArray(data)) {
  errors.push("games.json 的最外层应该是数组 [ ... ]");
  finish(1, 0, 0);
}

const seenIds = new Map();
const seenPlayUrls = new Map();
let maxId = 0;
let active = 0;
let removed = 0;

data.forEach((game, index) => {
  const n = index + 1;
  const isObject = game !== null && typeof game === "object" && !Array.isArray(game);
  const label = isObject && Number.isInteger(game.id) ? `第 ${n} 条（#${game.id}${game.title ? ` ${game.title}` : ""}）` : `第 ${n} 条`;
  if (!isObject) {
    errors.push(`${label}：应该是一个对象 { ... }`);
    return;
  }

  if (!Number.isInteger(game.id) || game.id <= 0) {
    errors.push(`${label}：id 必须是正整数`);
  } else {
    if (seenIds.has(game.id)) errors.push(`${label}：id ${game.id} 和第 ${seenIds.get(game.id)} 条重复`);
    else seenIds.set(game.id, n);
    maxId = Math.max(maxId, game.id);
  }

  if (game.removed !== undefined) {
    const extra = Object.keys(game).filter((k) => k !== "id" && k !== "removed");
    if (game.removed !== true || extra.length) {
      errors.push(`${label}：下架占位只能写成 { "id": ${Number.isInteger(game.id) ? game.id : "N"}, "removed": true }`);
    }
    removed++;
    return;
  }

  active++;
  checkGame(game, label);
  if (typeof game.playUrl === "string") {
    if (seenPlayUrls.has(game.playUrl)) warnings.push(`${label}：playUrl 和第 ${seenPlayUrls.get(game.playUrl)} 条相同`);
    else seenPlayUrls.set(game.playUrl, n);
  }
});

checkPlaceholders();
finish(maxId + 1, active, removed);
