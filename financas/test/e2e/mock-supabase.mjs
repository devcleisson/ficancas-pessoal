// Servidor local que imita a API do Supabase (Auth + PostgREST) sobre um
// Postgres real em memória (PGlite) com o MESMO esquema e políticas RLS da
// migração. Usado apenas nos testes de ponta a ponta.
import http from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import jwt from "jsonwebtoken";

const here = dirname(fileURLToPath(import.meta.url));
const SECRET = "e2e-secret-not-for-production-use-1234567890";
const PORT = Number(process.env.MOCK_PORT ?? 54321);

const db = new PGlite();
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique not null,
  encrypted_password text, raw_user_meta_data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;
`);
const migDir = join(here, "..", "..", "supabase", "migrations");
for (const f of readdirSync(migDir).filter((x) => x.endsWith(".sql")).sort()) await db.exec(readFileSync(join(migDir, f), "utf8"));

const refreshTokens = new Map();
const IDENT = /^[a-z_][a-z0-9_]*$/;

function userJson(u) {
  return {
    id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
    email_confirmed_at: u.created_at, confirmed_at: u.created_at, last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] }, user_metadata: u.raw_user_meta_data ?? {},
    identities: [], created_at: u.created_at, updated_at: u.created_at, is_anonymous: false,
  };
}

function session(u) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access_token = jwt.sign({ sub: u.id, email: u.email, role: "authenticated", aud: "authenticated", exp, session_id: randomUUID() }, SECRET);
  const refresh_token = randomUUID();
  refreshTokens.set(refresh_token, u.id);
  return { access_token, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token, user: userJson(u) };
}

async function findUser(where, val) {
  const r = await db.query(`select id, email, encrypted_password, raw_user_meta_data, created_at from auth.users where ${where} = $1`, [val]);
  return r.rows[0];
}

function claims(req) {
  const h = req.headers.authorization ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return null;
  try {
    const c = jwt.verify(token, SECRET);
    return c.role === "authenticated" ? c : null;
  } catch {
    return null;
  }
}

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
};

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString("utf8");
  return s ? JSON.parse(s) : undefined;
}

// --------------------------------------------------------------------------- Auth
async function handleAuth(req, res, url) {
  const path = url.pathname.replace("/auth/v1", "");
  if (path === "/signup" && req.method === "POST") {
    const b = await readBody(req);
    if (!b?.email || !b?.password) return send(res, 400, { code: "validation_failed", message: "Email and password required" });
    if (b.password.length < 6) return send(res, 422, { code: "weak_password", message: "Password should be at least 6 characters." });
    if (await findUser("email", b.email.toLowerCase())) return send(res, 422, { code: "user_already_exists", message: "User already registered" });
    await db.query("insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, $2, $3)", [b.email.toLowerCase(), b.password, JSON.stringify(b.data ?? {})]);
    return send(res, 200, session(await findUser("email", b.email.toLowerCase())));
  }
  if (path === "/token" && req.method === "POST") {
    const b = await readBody(req);
    const grant = url.searchParams.get("grant_type");
    if (grant === "password") {
      const u = await findUser("email", String(b?.email ?? "").toLowerCase());
      if (!u || u.encrypted_password !== b.password) return send(res, 400, { code: "invalid_credentials", message: "Invalid login credentials", error: "invalid_grant", error_description: "Invalid login credentials" });
      return send(res, 200, session(u));
    }
    if (grant === "refresh_token") {
      const id = refreshTokens.get(b?.refresh_token);
      if (!id) return send(res, 400, { code: "refresh_token_not_found", message: "Invalid Refresh Token" });
      return send(res, 200, session(await findUser("id", id)));
    }
    return send(res, 400, { message: "unsupported grant" });
  }
  if (path === "/user") {
    const c = claims(req);
    if (!c) return send(res, 401, { code: "bad_jwt", message: "invalid JWT" });
    if (req.method === "PUT") {
      const b = await readBody(req);
      if (b?.password) await db.query("update auth.users set encrypted_password=$1 where id=$2", [b.password, c.sub]);
      if (b?.data) await db.query("update auth.users set raw_user_meta_data=$1 where id=$2", [JSON.stringify(b.data), c.sub]);
    }
    const u = await findUser("id", c.sub);
    return u ? send(res, 200, userJson(u)) : send(res, 404, { message: "User not found" });
  }
  if (path === "/logout") return send(res, 204);
  if (path === "/settings") return send(res, 200, { external: { email: true }, mailer_autoconfirm: true });
  if (path === "/recover") return send(res, 200, {});
  return send(res, 404, { message: `auth route ${path} not mocked` });
}

// --------------------------------------------------------------------------- PostgREST
const RESERVED = new Set(["select", "order", "offset", "limit", "columns", "on_conflict"]);
const OPS = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" };

function buildWhere(params, args) {
  const parts = [];
  for (const [k, v] of params) {
    if (RESERVED.has(k)) continue;
    if (!IDENT.test(k)) throw Object.assign(new Error(`bad column ${k}`), { code: "PGRST100" });
    const dot = v.indexOf(".");
    const op = v.slice(0, dot);
    const val = v.slice(dot + 1);
    if (op === "is" && val === "null") parts.push(`"${k}" is null`);
    else if (op === "in") {
      const list = val.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, ""));
      args.push(list);
      parts.push(`"${k}"::text = any($${args.length}::text[])`);
    }
    else if (OPS[op]) {
      args.push(val);
      parts.push(`"${k}"::text ${OPS[op]} $${args.length}`);
    } else throw Object.assign(new Error(`operator ${op} not mocked`), { code: "PGRST100" });
  }
  return parts.length ? ` where ${parts.join(" and ")}` : "";
}

async function asRole(c, fn) {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [c?.sub ?? ""]);
    await tx.exec(`set local role ${c ? "authenticated" : "anon"}`);
    return fn(tx);
  });
}

const wrap = (sql) => `with r as (${sql}) select coalesce(json_agg(r), '[]'::json) as j from r`;

async function handleRest(req, res, url) {
  const table = url.pathname.replace("/rest/v1/", "");
  if (!IDENT.test(table)) return send(res, 404, { message: "no table" });
  const c = claims(req);
  const params = url.searchParams;
  const prefer = req.headers.prefer ?? "";
  const wantsObject = (req.headers.accept ?? "").includes("vnd.pgrst.object+json");
  const representation = prefer.includes("return=representation") || params.has("select");
  const args = [];
  let sql;

  const select = (params.get("select") ?? "*").split(",").map((s) => s.trim());
  if (!select.every((s) => s === "*" || IDENT.test(s))) return send(res, 400, { message: "bad select" });
  const cols = select.includes("*") ? "*" : select.map((s) => `"${s}"`).join(", ");
  const T = `public."${table}"`;

  try {
    if (req.method === "GET") {
      sql = `select ${cols} from ${T}${buildWhere(params, args)}`;
      const order = params.get("order");
      if (order) {
        sql += " order by " + order.split(",").map((o) => {
          const [col, dir] = o.split(".");
          if (!IDENT.test(col)) throw new Error("bad order");
          return `"${col}" ${dir === "desc" ? "desc" : "asc"}`;
        }).join(", ");
      }
      if (params.get("limit")) sql += ` limit ${Number(params.get("limit"))}`;
      if (params.get("offset")) sql += ` offset ${Number(params.get("offset"))}`;
    } else if (req.method === "POST") {
      const body = await readBody(req);
      const rows = Array.isArray(body) ? body : [body];
      const keys = params.get("columns") ? params.get("columns").split(",").map((s) => s.replace(/"/g, "")) : [...new Set(rows.flatMap(Object.keys))];
      if (!keys.every((k) => IDENT.test(k))) throw new Error("bad column");
      const list = keys.map((k) => `"${k}"`).join(", ");
      args.push(JSON.stringify(rows));
      sql = `insert into ${T} (${list}) select ${list} from json_populate_recordset(null::${T}, $1::json)`;
      if (prefer.includes("resolution=merge-duplicates")) {
        const conflict = params.get("on_conflict") ?? "id";
        const updates = keys.filter((k) => k !== conflict).map((k) => `"${k}" = excluded."${k}"`);
        sql += ` on conflict ("${conflict}") do ${updates.length ? `update set ${updates.join(", ")}` : "nothing"}`;
      }
      sql += ` returning ${cols}`;
    } else if (req.method === "PATCH") {
      const body = await readBody(req);
      const keys = Object.keys(body);
      if (!keys.every((k) => IDENT.test(k))) throw new Error("bad column");
      args.push(JSON.stringify(body));
      const list = keys.map((k) => `"${k}"`).join(", ");
      sql = `update ${T} set (${list}) = (select ${list} from json_populate_record(null::${T}, $1::json))${buildWhere(params, args)} returning ${cols}`;
    } else if (req.method === "DELETE") {
      sql = `delete from ${T}${buildWhere(params, args)} returning ${cols}`;
    } else return send(res, 405, { message: "method" });

    const out = await asRole(c, async (tx) => (await tx.query(wrap(sql), args)).rows[0].j);
    const status = req.method === "POST" ? 201 : 200;
    if (wantsObject) {
      if (out.length !== 1) return send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${out.length} rows` });
      return send(res, 200, out[0]);
    }
    if (!representation && req.method !== "GET") return send(res, req.method === "DELETE" ? 204 : 201);
    return send(res, status, out, { "Content-Range": `0-${Math.max(0, out.length - 1)}/*` });
  } catch (e) {
    const code = e.code ?? "PGRST000";
    const status = code === "42501" ? 403 : code === "23505" || code === "23503" ? 409 : 400;
    return send(res, status, { code, message: e.message, details: e.detail ?? null, hint: e.hint ?? null });
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] ?? "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range");
  if (req.method === "OPTIONS") return send(res, 204);
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname.startsWith("/auth/v1")) return await handleAuth(req, res, url);
    if (url.pathname.startsWith("/rest/v1/")) return await handleRest(req, res, url);
    send(res, 404, { message: "not found" });
  } catch (e) {
    send(res, 500, { message: String(e?.message ?? e) });
  }
});

server.listen(PORT, () => console.log(`mock supabase on :${PORT}`));
