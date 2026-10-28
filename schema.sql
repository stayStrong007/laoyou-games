-- 佬友的游戏屋 · D1 建表语句
-- 本地：npx wrangler d1 execute laoyou-games --local --file=schema.sql
-- 线上：npx wrangler d1 execute laoyou-games --remote --file=schema.sql（也可以在 Cloudflare 控制台的 D1 Console 里粘贴执行）

-- 点赞明细：同一访客对同一游戏只有一条，用于去重和事后清理
CREATE TABLE IF NOT EXISTS likes (
  game_id    INTEGER NOT NULL,
  visitor_id TEXT    NOT NULL,  -- 浏览器生成的匿名 UUID，存在 localStorage
  ip_hash    TEXT    NOT NULL,  -- 加盐哈希，不存原始 IP
  created_at INTEGER NOT NULL,  -- 毫秒时间戳
  PRIMARY KEY (game_id, visitor_id)
);

-- 计数表：GET 时只需读 N 行（N = 游戏数）
CREATE TABLE IF NOT EXISTS like_counts (
  game_id INTEGER PRIMARY KEY,
  count   INTEGER NOT NULL DEFAULT 0
);
