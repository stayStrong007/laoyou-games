// 点赞接口（Cloudflare Pages Function + D1）
//   GET  /api/likes → { "1": 12, "2": 3 }，边缘缓存约 30 秒
//   POST /api/likes  { id, visitorId, action: "like" | "unlike" } → { id, count, liked }

const CACHE_SECONDS = 30;
const GAME_IDS_TTL = 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// games.json 里未下架的 id，按隔离实例缓存一分钟，免得每次点赞都读一遍
let gameIds = { at: 0, ids: null };

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

async function activeGameIds(request, env) {
  if (gameIds.ids && Date.now() - gameIds.at < GAME_IDS_TTL) return gameIds.ids;
  const res = await env.ASSETS.fetch(new URL("/games.json", request.url));
  if (!res.ok) throw new Error(`读取 games.json 失败：HTTP ${res.status}`);
  const games = await res.json();
  const ids = new Set(games.filter((g) => g && !g.removed && Number.isInteger(g.id)).map((g) => g.id));
  gameIds = { at: Date.now(), ids };
  return ids;
}

async function hashIp(ip, salt) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${ip}`));
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestGet({ request, env, waitUntil }) {
  const cache = globalThis.caches?.default;
  const cacheKey = new Request(new URL("/api/likes", request.url).toString());
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }
  try {
    const { results } = await env.DB.prepare("SELECT game_id, count FROM like_counts WHERE count > 0").all();
    const counts = {};
    for (const row of results) counts[row.game_id] = row.count;
    const res = json(counts, 200, { "Cache-Control": `public, max-age=${CACHE_SECONDS}` });
    if (cache) waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch (err) {
    console.error("读取点赞数失败", err);
    return json({ error: "喜爱数暂时不可用" }, 503);
  }
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求格式不对" }, 400);
  }
  const id = Number(body?.id);
  const visitorId = String(body?.visitorId ?? "");
  const action = body?.action;
  if (!Number.isInteger(id) || id <= 0) return json({ error: "id 不合法" }, 400);
  if (!UUID_RE.test(visitorId)) return json({ error: "visitorId 不合法" }, 400);
  if (action !== "like" && action !== "unlike") return json({ error: "action 只能是 like 或 unlike" }, 400);

  try {
    const ids = await activeGameIds(request, env);
    if (!ids.has(id)) return json({ error: "没有这款游戏" }, 404);

    const db = env.DB;
    const change =
      action === "like"
        ? db
            .prepare("INSERT OR IGNORE INTO likes (game_id, visitor_id, ip_hash, created_at) VALUES (?1, ?2, ?3, ?4)")
            .bind(id, visitorId, await hashIp(request.headers.get("CF-Connecting-IP") ?? "", env.IP_SALT ?? ""), Date.now())
        : db.prepare("DELETE FROM likes WHERE game_id = ?1 AND visitor_id = ?2").bind(id, visitorId);

    // 同一个 batch 是一个事务：改明细后用明细重算计数，并发点赞也不会漂移
    const [, , countResult, likedResult] = await db.batch([
      change,
      db
        .prepare(
          "INSERT INTO like_counts (game_id, count) VALUES (?1, (SELECT COUNT(*) FROM likes WHERE game_id = ?1)) " +
            "ON CONFLICT(game_id) DO UPDATE SET count = excluded.count",
        )
        .bind(id),
      db.prepare("SELECT count FROM like_counts WHERE game_id = ?1").bind(id),
      db.prepare("SELECT 1 AS liked FROM likes WHERE game_id = ?1 AND visitor_id = ?2").bind(id, visitorId),
    ]);

    return json({ id, count: countResult.results[0]?.count ?? 0, liked: likedResult.results.length > 0 });
  } catch (err) {
    console.error("记录点赞失败", err);
    return json({ error: "喜爱暂时记不上，稍后再试" }, 503);
  }
}
