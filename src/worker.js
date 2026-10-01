// Worker da Central de Projetos: serve os arquivos do site e guarda a lista editável (categorias e projetos) no KV.
// Leitura é pública, exceto pastas (categorias) protegidas por senha. Gravar exige a senha do segredo EDIT_PASSWORD.
// Pastas protegidas: a lista só mostra os projetos delas e os arquivos em /projetos/ só abrem depois de digitar a senha da pasta.

const CHAVE = "estado";
const CHAVE_ANTERIOR = "estado-anterior";
const CHAVE_ACESSOS = "acessos"; // { idDaCategoria: { sal, hash } }
const COOKIE = "cp_acc";
const URL_OK = /^(https:\/\/|\/?projetos\/)/i;

const resp = (corpo, status = 200, extra = {}) => new Response(JSON.stringify(corpo), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
});

const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

function iguais(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function sha(texto) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(texto))); }
async function senhaConfere(recebida, esperada) {
  if (!esperada || !recebida) return false;
  return iguais(await sha(recebida), await sha(esperada));
}

/* ---------- cookie assinado com as pastas liberadas neste navegador ---------- */
async function chaveHmac(env) {
  return crypto.subtle.importKey("raw", enc.encode("cp|" + env.EDIT_PASSWORD), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}
async function assinar(env, texto) { return b64u(await crypto.subtle.sign("HMAC", await chaveHmac(env), enc.encode(texto))); }

async function lerCookie(request, env) {
  const vazio = { pastas: new Set(), admin: false };
  if (!env.EDIT_PASSWORD) return vazio;
  const m = (request.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
  if (!m) return vazio;
  const [corpo, ass] = m[1].split(".");
  if (!corpo || !ass || !iguais(ass, await assinar(env, corpo))) return vazio;
  try {
    const d = JSON.parse(atob(corpo.replace(/-/g, "+").replace(/_/g, "/")));
    if (!d || d.e < Date.now()) return vazio;
    const pastas = new Set(Array.isArray(d.c) ? d.c : []);
    return { pastas, admin: pastas.has("*") };
  } catch { return vazio; }
}

async function montarCookie(env, pastas, horas) {
  const corpo = b64u(enc.encode(JSON.stringify({ c: [...pastas], e: Date.now() + horas * 3600e3 })));
  return `${COOKIE}=${corpo}.${await assinar(env, corpo)}; Path=/; Max-Age=${horas * 3600}; HttpOnly; Secure; SameSite=Lax`;
}
const cookieLimpo = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

/* ---------- dados ---------- */
let cache = null; // curto, só para não ler o KV a cada arquivo
async function dados(env, fresco = false) {
  if (!fresco && cache && Date.now() - cache.t < 5000) return cache;
  const [salvo, acessos] = await Promise.all([env.CENTRAL_KV.get(CHAVE, { type: "json" }), env.CENTRAL_KV.get(CHAVE_ACESSOS, { type: "json" })]);
  cache = { t: Date.now(), salvo, acessos: acessos || {} };
  return cache;
}

const txt = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// Aceita só o formato esperado e devolve uma cópia limpa (ou null se inválido).
function validar(e) {
  if (!e || !Array.isArray(e.categorias) || !Array.isArray(e.itens)) return null;
  if (e.categorias.length > 60 || e.itens.length > 600) return null;
  const ids = new Set();
  const categorias = [];
  for (const c of e.categorias) {
    const id = txt(c && c.id, 60), nome = txt(c && c.nome, 60);
    if (!id || !nome || ids.has(id)) return null;
    ids.add(id);
    categorias.push({
      id, nome, cor: /^#[0-9a-f]{6}$/i.test(c.cor) ? c.cor : "#8A8C91", nota: txt(c.nota, 120),
      empresa: c.empresa === "primeocean" ? "primeocean" : "triunfo",
    });
  }
  const vistos = new Set();
  const itens = [];
  for (const i of e.itens) {
    const id = txt(i && i.id, 80), titulo = txt(i && i.titulo, 120), url = txt(i && i.url, 600);
    if (!id || !titulo || vistos.has(id) || !ids.has(i.cat) || !URL_OK.test(url)) return null;
    vistos.add(id);
    const atualizado = /^\d{4}-\d{2}-\d{2}$/.test(i.atualizado) ? i.atualizado : "";
    itens.push({ id, titulo, url, cat: i.cat, descricao: txt(i.descricao, 300), atualizado });
  }
  return { categorias, itens };
}

/* ---------- API ---------- */
async function api(request, env, caminho) {
  const kv = env.CENTRAL_KV;
  if (!kv) return resp({ erro: "KV não configurado" }, 503);
  const editavel = !!env.EDIT_PASSWORD;
  const lerCorpo = async () => { try { return await request.json(); } catch { return null; } };

  if (caminho === "/api/projetos" && request.method === "GET") {
    const { salvo, acessos } = await dados(env, true);
    if (!salvo) return resp({ estado: null, rev: 0, editavel });
    const ck = await lerCookie(request, env);
    const admin = ck.admin || await senhaConfere(request.headers.get("x-senha") || "", env.EDIT_PASSWORD);
    const bloqueada = new Set();
    const categorias = salvo.estado.categorias.map(c => {
      const restrita = !!acessos[c.id];
      const trancada = restrita && !admin && !ck.pastas.has(c.id);
      if (trancada) bloqueada.add(c.id);
      const qtd = salvo.estado.itens.filter(i => i.cat === c.id).length;
      return { ...c, restrita, bloqueada: trancada, qtd };
    });
    const itens = salvo.estado.itens.filter(i => !bloqueada.has(i.cat));
    return resp({ estado: { categorias, itens }, rev: salvo.rev, editavel, admin });
  }

  if (caminho === "/api/desbloquear" && request.method === "POST") {
    if (!editavel) return resp({ erro: "Proteção indisponível." }, 503);
    const corpo = await lerCorpo();
    const { acessos } = await dados(env, true);
    const reg = corpo && acessos[corpo.cat];
    const ok = reg && typeof corpo.senha === "string" && iguais(await sha(reg.sal + ":" + corpo.senha), reg.hash);
    if (!ok) { await new Promise(r => setTimeout(r, 700)); return resp({ erro: "Senha incorreta." }, 401); }
    const ck = await lerCookie(request, env);
    ck.pastas.add(corpo.cat);
    return resp({ ok: true }, 200, { "set-cookie": await montarCookie(env, ck.pastas, ck.admin ? 8 : 168) });
  }

  if (caminho === "/api/travar" && request.method === "POST") return resp({ ok: true }, 200, { "set-cookie": cookieLimpo });

  if (request.method === "POST" || request.method === "PUT") {
    const senha = request.headers.get("x-senha") || "";
    if (!editavel) return resp({ erro: "Edição desativada: falta criar o segredo EDIT_PASSWORD na Cloudflare." }, 503);
    if (!(await senhaConfere(senha, env.EDIT_PASSWORD))) {
      await new Promise(r => setTimeout(r, 600));
      return resp({ erro: "Senha incorreta." }, 401);
    }
    if (caminho === "/api/login" && request.method === "POST") {
      const ck = await lerCookie(request, env);
      ck.pastas.add("*");
      return resp({ ok: true }, 200, { "set-cookie": await montarCookie(env, ck.pastas, 8) });
    }

    if (caminho === "/api/acesso" && request.method === "POST") {
      const corpo = await lerCorpo();
      const { salvo, acessos } = await dados(env, true);
      if (!corpo || !salvo || !salvo.estado.categorias.some(c => c.id === corpo.cat)) return resp({ erro: "Pasta não encontrada. Salve a lista antes." }, 400);
      const novos = { ...acessos };
      if (typeof corpo.senha === "string" && corpo.senha) {
        if (corpo.senha.length < 4 || corpo.senha.length > 80) return resp({ erro: "A senha da pasta deve ter de 4 a 80 caracteres." }, 400);
        const sal = hex(crypto.getRandomValues(new Uint8Array(12)));
        novos[corpo.cat] = { sal, hash: await sha(sal + ":" + corpo.senha) };
      } else delete novos[corpo.cat];
      await kv.put(CHAVE_ACESSOS, JSON.stringify(novos));
      cache = null;
      return resp({ ok: true, restrita: !!novos[corpo.cat] });
    }

    if (caminho === "/api/projetos" && request.method === "PUT") {
      const corpo = await lerCorpo();
      const estado = validar(corpo && corpo.estado);
      if (!estado) return resp({ erro: "Dados inválidos." }, 400);
      const { salvo: atual, acessos } = await dados(env, true);
      const revAtual = atual ? atual.rev : 0;
      if ((corpo.base | 0) !== revAtual) return resp({ erro: "A lista foi alterada em outro lugar.", rev: revAtual }, 409);
      if (atual) await kv.put(CHAVE_ANTERIOR, JSON.stringify(atual));
      const rev = revAtual + 1;
      await kv.put(CHAVE, JSON.stringify({ rev, estado, em: new Date().toISOString() }));
      // pastas excluídas perdem a senha
      const ids = new Set(estado.categorias.map(c => c.id));
      const limpos = Object.fromEntries(Object.entries(acessos).filter(([id]) => ids.has(id)));
      if (Object.keys(limpos).length !== Object.keys(acessos).length) await kv.put(CHAVE_ACESSOS, JSON.stringify(limpos));
      cache = null;
      return resp({ ok: true, rev });
    }
  }
  return resp({ erro: "Não encontrado." }, 404);
}

/* ---------- arquivos de pastas protegidas ---------- */
const normaCaminho = p => decodeURIComponent(p).split(/[?#]/)[0].replace(/^\/+/, "").replace(/\/index\.html$/i, "").replace(/\.html$/i, "").replace(/\/+$/, "").toLowerCase();

async function guardar(request, env, pathname) {
  if (!env.CENTRAL_KV || !env.EDIT_PASSWORD) return null;
  const { salvo, acessos } = await dados(env);
  if (!salvo || !Object.keys(acessos).length) return null;
  let alvo;
  try { alvo = normaCaminho(pathname); } catch { return null; }
  const item = salvo.estado.itens.find(i => !/^https?:/i.test(i.url) && normaCaminho(i.url) === alvo);
  if (!item || !acessos[item.cat]) return null;
  const ck = await lerCookie(request, env);
  if (ck.admin || ck.pastas.has(item.cat)) return "ok";
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Pasta protegida</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e0e0f;color:#ededed;font-family:Poppins,Helvetica,Arial,sans-serif;padding:24px}main{max-width:380px;text-align:center}h1{font-size:1.4rem;margin:12px 0 6px}p{color:#a9a9ad;font-size:14px;line-height:1.5}a{display:inline-block;margin-top:18px;background:#da202c;color:#fff;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:8px}</style></head>
<body><main><div style="font-size:34px">🔒</div><h1>Pasta protegida</h1><p>Este projeto fica em uma pasta com senha. Abra a Central e digite a senha da pasta para liberar o acesso.</p><a href="/?pasta=${encodeURIComponent(item.cat)}">Ir para a Central</a></main></body></html>`;
  return new Response(html, { status: 401, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/")) return api(request, env, pathname);

    // Lista inicial pública só vale enquanto não existe lista salva (senão revelaria títulos de pastas protegidas)
    if (pathname === "/projetos.js" && env.CENTRAL_KV) {
      const { salvo } = await dados(env);
      if (salvo) return new Response("window.PROJETOS = [];", { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" } });
    }

    if (pathname.startsWith("/projetos/")) {
      const g = await guardar(request, env, pathname);
      if (g && g !== "ok") return g;
      const r = await env.ASSETS.fetch(request);
      if (g === "ok") { const h = new Headers(r.headers); h.set("cache-control", "private, no-store"); return new Response(r.body, { status: r.status, headers: h }); }
      return r;
    }
    return env.ASSETS.fetch(request);
  },
};
