// Worker da Central de Projetos: serve os arquivos do site e guarda a lista editável (categorias e projetos) no KV.
// Leitura é pública; gravar exige a senha configurada no segredo EDIT_PASSWORD.

const CHAVE = "estado";
const CHAVE_ANTERIOR = "estado-anterior";
const URL_OK = /^(https:\/\/|\/?projetos\/)/i;

const resp = (corpo, status = 200) => new Response(JSON.stringify(corpo), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

async function senhaConfere(recebida, esperada) {
  if (!esperada || !recebida) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(recebida)),
    crypto.subtle.digest("SHA-256", enc.encode(esperada)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
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
    categorias.push({ id, nome, cor: /^#[0-9a-f]{6}$/i.test(c.cor) ? c.cor : "#8A8C91", nota: txt(c.nota, 120) });
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

async function api(request, env, caminho) {
  const kv = env.CENTRAL_KV;
  if (!kv) return resp({ erro: "KV não configurado" }, 503);
  const editavel = !!env.EDIT_PASSWORD;

  if (caminho === "/api/projetos" && request.method === "GET") {
    const salvo = await kv.get(CHAVE, { type: "json" });
    return resp({ estado: salvo ? salvo.estado : null, rev: salvo ? salvo.rev : 0, editavel });
  }

  if (request.method === "POST" || request.method === "PUT") {
    const senha = request.headers.get("x-senha") || "";
    if (!editavel) return resp({ erro: "Edição desativada: falta criar o segredo EDIT_PASSWORD na Cloudflare." }, 503);
    if (!(await senhaConfere(senha, env.EDIT_PASSWORD))) {
      await new Promise(r => setTimeout(r, 600));
      return resp({ erro: "Senha incorreta." }, 401);
    }
    if (caminho === "/api/login" && request.method === "POST") return resp({ ok: true });

    if (caminho === "/api/projetos" && request.method === "PUT") {
      let corpo;
      try { corpo = await request.json(); } catch { return resp({ erro: "JSON inválido." }, 400); }
      const estado = validar(corpo && corpo.estado);
      if (!estado) return resp({ erro: "Dados inválidos." }, 400);
      const atual = await kv.get(CHAVE, { type: "json" });
      const revAtual = atual ? atual.rev : 0;
      if ((corpo.base | 0) !== revAtual) return resp({ erro: "A lista foi alterada em outro lugar.", rev: revAtual }, 409);
      if (atual) await kv.put(CHAVE_ANTERIOR, JSON.stringify(atual));
      const rev = revAtual + 1;
      await kv.put(CHAVE, JSON.stringify({ rev, estado, em: new Date().toISOString() }));
      return resp({ ok: true, rev });
    }
  }
  return resp({ erro: "Não encontrado." }, 404);
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/")) return api(request, env, pathname);
    return env.ASSETS.fetch(request);
  },
};
