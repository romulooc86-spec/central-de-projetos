/* Central de Projetos: lista agrupada por pasta, editável online, com faixa Prime Ocean e pastas protegidas por senha (API do Worker + KV). */
const $ = s => document.querySelector(s);
const TIPOS = [[/painel da equipe/i,"Editor"],[/boletim/i,"Boletim"],[/painel/i,"Painel"],[/planejamento/i,"Planejamento"],[/cen[aá]rio/i,"Cenários"],
  [/indicador/i,"Indicadores"],[/controle/i,"Controle"],[/central/i,"Central"],[/alinhamento/i,"Alinhamento"],[/docagem/i,"Docagem"],[/obra/i,"Obras"],[/gest[aã]o/i,"Gestão"]];
const tipoDe = i => (TIPOS.find(([re]) => re.test(i.titulo)) || [0, "Projeto"])[1];
const CORES = ["#DA202C","#7B4FB8","#2F6FDE","#14A3A3","#E8772B","#8A8C91","#3C9D4E","#C23A8A"];
const COR_PADRAO = { "Boletins de navio":"#DA202C", "Área da equipe":"#7B4FB8", "TPS":"#2F6FDE", "Prime Ocean":"#06BEAE", "Operações":"#E8772B", "Pessoal":"#8A8C91" };
const NOTA_PADRAO = { "Boletins de navio":"Dados ao vivo da planilha da equipe", "Área da equipe":"Uso interno: configurar e gerar envios" };
const MES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const dataCurta = s => { if (!s) return ''; const [a, m, d] = s.split('-').map(Number); return `${d} ${MES[m - 1]} ${a}`; };
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const diasDesde = s => { const [a, m, d] = s.split('-').map(Number); return Math.round((new Date().setHours(0,0,0,0) - new Date(a, m - 1, d)) / 864e5); };
const haQuanto = s => { const dias = diasDesde(s);
  return dias <= 0 ? 'atualizado hoje' : dias === 1 ? 'há 1 dia' : dias < 30 ? `há ${dias} dias` : `há ${Math.round(dias / 30)} ${Math.round(dias / 30) === 1 ? 'mês' : 'meses'}`; };
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const slug = s => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "item";
const ls = { get(k, p) { try { return localStorage.getItem(k) ?? p; } catch (e) { return p; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const ss = { get(k) { try { return sessionStorage.getItem(k) || ""; } catch (e) { return ""; } }, set(k, v) { try { v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch (e) {} } };

function el(tag, attrs, ...kids){ const e = document.createElement(tag); for (const k in attrs || {}){ if (k === "text") e.textContent = attrs[k]; else if (k === "html") e.innerHTML = attrs[k]; else if (k.startsWith("on")) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]); } kids.flat().forEach(c => c != null && c !== false && e.append(c)); return e; }

/* ícones (fixos, sem dados externos) */
const IC = {
  estrela: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8z"/></svg>',
  copiar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
  cadeado: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  seta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
};
const icone = (nome, extra) => el("span", { html: IC[nome], style: "display:inline-flex", ...(extra || {}) });

/* ícones das pastas (traço simples, herdam a cor da pasta) */
const tr = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONES_CAT = {
  navio: tr('<path d="M3 17c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0"/><path d="M5 14 4 9h16l-1 5"/><path d="M8 9V5h8v4"/>'),
  ancora: tr('<circle cx="12" cy="5" r="2"/><path d="M12 7v14M8 11h8"/><path d="M5 14a7 7 0 0 0 14 0"/>'),
  guindaste: tr('<path d="M4 21h8M8 21V6l10 2M8 6 4 10"/><path d="M18 8v6"/><circle cx="18" cy="16" r="2"/>'),
  engrenagem: tr('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>'),
  grafico: tr('<path d="M4 20V4M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-8"/>'),
  documento: tr('<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 13h5M10 17h5"/>'),
  equipe: tr('<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.3"/><path d="M17 14.2c2.3.3 4 2.3 4 4.8"/>'),
  pessoa: tr('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>'),
  predio: tr('<path d="M5 21V4h9v17M14 9h5v12M3 21h18"/><path d="M8 8h3M8 12h3M8 16h3"/>'),
  caminhao: tr('<path d="M2 6h12v10H2zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>'),
  pasta: tr('<path d="M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
};
const ROTULOS_ICONE = { navio:"Navio", ancora:"Âncora (Prime Ocean)", guindaste:"Guindaste (terminal)", engrenagem:"Engrenagem (operações)", grafico:"Gráfico", documento:"Documento", equipe:"Equipe", pessoa:"Pessoal", predio:"Prédio", caminhao:"Caminhão", pasta:"Pasta" };
const ICONE_AUTO = [[/prime|ocean|rebocador|balsa/i,"ancora"],[/navio|boletim|produ/i,"navio"],[/tps|terminal|cais|porto/i,"guindaste"],[/opera|abastec|docagem/i,"engrenagem"],[/equipe/i,"equipe"],[/pessoal/i,"pessoa"],[/indicador|custo|result/i,"grafico"],[/plane|document|relat/i,"documento"],[/log[ií]stic|transporte|carga/i,"caminhao"]];
const iconeCat = c => {
  const k = ICONES_CAT[c.icone] ? c.icone : (ICONE_AUTO.find(([re]) => re.test(c.nome)) || [0, "pasta"])[1];
  return el("span", { class: "ico-cat", html: ICONES_CAT[k], "aria-hidden": "true" });
};

/* ---------- aparência ---------- */
function aplicarTema(t){
  document.documentElement.dataset.tema = t;
  $("#temaClaro").setAttribute("aria-pressed", String(t !== "escuro"));
  $("#temaEscuro").setAttribute("aria-pressed", String(t === "escuro"));
  ls.set("cp-tema", t);
}

/* ---------- estado ---------- */
let estado = { categorias: [], itens: [] };
let rev = 0, editavelNoServidor = false, apiOk = false;
let senha = ss.get("cp-senha"), editando = false;
let filtroCat = ls.get("cp-filtro", "Todos"), visao = ls.get("cp-visao", "grade"), ordem = ls.get("cp-ordem", "manual");
let fechados = new Set(JSON.parse(ls.get("cp-fechados", "[]")));
let favoritos = new Set(JSON.parse(ls.get("cp-favs", "[]")));
let arrastando = null;


function estadoDoArquivo(){
  const seed = (window.PROJETOS || []).slice().sort((a, b) => (b.atualizado || "").localeCompare(a.atualizado || "") || a.titulo.localeCompare(b.titulo));
  const ordemCat = ["Boletins de navio", "Área da equipe", "TPS", "Prime Ocean", "Operações", "Pessoal"];
  const nomes = [...new Set(seed.map(i => i.categoria))].sort((a, b) => (ordemCat.indexOf(a) + 1 || 99) - (ordemCat.indexOf(b) + 1 || 99));
  const categorias = nomes.map((n, k) => ({ id: slug(n), nome: n, cor: COR_PADRAO[n] || CORES[k % CORES.length], nota: NOTA_PADRAO[n] || "" }));
  const usados = new Set();
  const itens = seed.map(i => { let id = slug(i.titulo), n = 2; while (usados.has(id)) id = slug(i.titulo) + "-" + n++; usados.add(id);
    return { id, titulo: i.titulo, url: i.url, cat: slug(i.categoria), descricao: i.descricao || "", atualizado: i.atualizado || "" }; });
  return { categorias, itens };
}

async function carregar(){
  try {
    const r = await fetch("/api/projetos", { cache: "no-store", headers: senha ? { "x-senha": senha } : {} });
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    apiOk = true; editavelNoServidor = !!d.editavel; rev = d.rev || 0;
    estado = d.estado || estadoDoArquivo();
    ls.set("cp-copia", JSON.stringify(estado));
  } catch (e) {
    apiOk = false;
    let copia = null; try { copia = JSON.parse(ls.get("cp-copia", "null")); } catch (x) {}
    estado = copia || estadoDoArquivo();
  }
}

/* ---------- gravação ---------- */
let gravando = Promise.resolve();
function estadoSalvar(msg){ const e = $("#estado-salvo"); if (e) { e.textContent = msg; e.classList.toggle("erro", /erro|falha|outro/i.test(msg)); } }
function salvar(){
  estadoSalvar("Salvando…");
  gravando = gravando.then(async () => {
    try {
      const r = await fetch("/api/projetos", { method: "PUT", headers: { "content-type": "application/json", "x-senha": senha }, body: JSON.stringify({ estado, base: rev }) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 409) { estadoSalvar("Alterado em outro lugar"); toast("A lista mudou em outro lugar. Recarregando…"); await carregar(); render(); return; }
      if (r.status === 401) { sair(); toast("Senha inválida. Entre de novo."); return; }
      if (!r.ok) throw new Error(d.erro || r.status);
      rev = d.rev; ls.set("cp-copia", JSON.stringify(estado)); estadoSalvar("Salvo online ✓");
    } catch (e) { estadoSalvar("Erro ao salvar: " + e.message); }
  });
  return gravando;
}
function mudou(){ render(); salvar(); }

async function chamarAcesso(cat, nova){
  const r = await fetch("/api/acesso", { method: "POST", headers: { "content-type": "application/json", "x-senha": senha }, body: JSON.stringify({ cat, senha: nova || "" }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erro || r.status);
  return d;
}

let tToast;
function toast(msg){ let t = $("#toast"); if (!t) { t = el("div", { id: "toast", role: "status" }); document.body.append(t); } t.textContent = msg; t.hidden = false; clearTimeout(tToast); tToast = setTimeout(() => t.hidden = true, 3200); }

/* ---------- derivados ---------- */
const catDe = id => estado.categorias.find(c => c.id === id);
const qtdDe = c => c.bloqueada ? (c.qtd || 0) : estado.itens.filter(i => i.cat === c.id).length;
function origemDe(url){ if (!/^https?:/i.test(url)) return ["Abre sem login", "livre"]; if (/claude\.ai/i.test(url)) return ["Requer login", "login"]; return ["Link externo", "externo"]; }
const ordenadores = {
  manual: null,
  recentes: (a, b) => (b.atualizado || "").localeCompare(a.atualizado || "") || a.titulo.localeCompare(b.titulo),
  az: (a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"),
};
function salvarFavs(){ ls.set("cp-favs", JSON.stringify([...favoritos])); }

/* ---------- desenho ---------- */
function render(){
  const cats = estado.categorias, itens = estado.itens;
  document.body.classList.toggle("editando", editando);
  document.body.classList.toggle("lista", visao === "lista");
  if (filtroCat !== "Todos" && !catDe(filtroCat)) filtroCat = "Todos";

  const total = itens.length + cats.filter(c => c.bloqueada).reduce((s, c) => s + (c.qtd || 0), 0);
  const frentes = cats.filter(c => qtdDe(c) || editando).length;
  const livres = itens.filter(i => !/^https?:/i.test(i.url)).length;
  $("#sub").textContent = `${total} projetos · ${frentes} pastas · ${livres} abrem sem login`;

  const chips = $("#chips"); chips.replaceChildren();
  [{ id: "Todos", nome: "Todos" }, ...cats.filter(c => qtdDe(c) || editando)].forEach(c => chips.append(el("button", { type: "button", class: "chip", style: c.id === "Todos" ? "" : `--cat:${c.cor}`, "aria-pressed": String(c.id === filtroCat),
    onclick: () => { filtroCat = c.id; ls.set("cp-filtro", c.id); render(); } },
    c.id === "Todos" ? null : iconeCat(c), c.bloqueada ? icone("cadeado", { style: "display:inline-flex;width:12px;height:12px" }) : null, c.nome, el("span", { class: "n", text: c.id === "Todos" ? total : qtdDe(c) }))));
  $("#ordem").value = ordem;
  $("#vGrade").setAttribute("aria-pressed", String(visao !== "lista"));
  $("#vLista").setAttribute("aria-pressed", String(visao === "lista"));
  $("#btnEditar").textContent = editando ? "Sair da edição" : "Editar";
  $("#btnEditar").classList.toggle("ativo", editando);
  $("#faixa-edicao").hidden = !editando;

  const q = norm($("#busca").value.trim());
  const ord = ordenadores[ordem];
  const lista = $("#lista"), fav = $("#fav");
  lista.replaceChildren(); fav.replaceChildren();
  let achou = 0, k = 0;
  const secTriunfo = [];

  /* favoritos (só na visão geral, sem busca) */
  if (!q && filtroCat === "Todos") {
    const fs = itens.filter(i => favoritos.has(i.id));
    if (fs.length) fav.append(el("div", { class: "fav-bloco" }, el("section", { class: "grupo" },
      el("div", { class: "grupo-cab" }, el("span", { class: "ponto" }), el("h2", { text: "Favoritos" }), el("span", { class: "qtd", text: String(fs.length) })),
      el("div", { class: "grade" }, fs.map(i => card(i, k++))))));
  }

  cats.forEach(c => {
    if (filtroCat !== "Todos" && filtroCat !== c.id) return;
    let vis = c.bloqueada ? [] : itens.filter(i => i.cat === c.id && (!q || norm(i.titulo + " " + i.descricao + " " + c.nome).includes(q)));
    if (ord) vis = vis.slice().sort(ord);
    if (c.bloqueada ? q : (!vis.length && (q || !editando))) return;
    achou += c.bloqueada ? 1 : vis.length;
    const fechado = fechados.has(c.id) && !q;
    const cor = c.cor;
    const corpo = c.bloqueada
      ? el("div", { class: "trava" }, icone("cadeado"), el("p", {}, el("b", { text: "Pasta protegida. " }), `${c.qtd || 0} projeto(s) aqui. Digite a senha para ver.`),
          el("button", { type: "button", class: "btn primario", onclick: () => dialogoDesbloquear(c) }, "Digitar senha"))
      : vis.length ? el("div", { class: "grade" }, vis.map(i => card(i, k++))) : el("div", { class: "grade-vazia", text: "Pasta vazia. Arraste um projeto para cá ou crie um novo." });
    const sec = el("section", { class: "grupo" + (fechado ? " fechado" : ""), style: `--cat:${cor}`, "data-cat": c.id },
      el("div", { class: "grupo-cab" }, iconeCat(c), el("h2", { text: c.nome }), el("span", { class: "qtd", text: String(c.bloqueada ? (c.qtd || 0) : vis.length) }),
        c.restrita && !c.bloqueada ? el("span", { class: "nota", title: "Pasta com senha (você já liberou)" }, "🔓 protegida") : null,
        (c.nota ? el("span", { class: "nota", text: c.nota }) : null),
        el("div", { class: "fim" },
          editando ? el("button", { type: "button", class: "mini", onclick: () => dialogoUmaCategoria(c).then(render) }, "Configurar pasta") : null,
          el("button", { type: "button", class: "mini recolher", "aria-expanded": String(!fechado), title: fechado ? "Mostrar" : "Recolher", onclick: () => { fechado ? fechados.delete(c.id) : fechados.add(c.id); ls.set("cp-fechados", JSON.stringify([...fechados])); render(); } }, icone("seta")))),
      corpo);
    if (editando) {
      sec.addEventListener("dragover", e => { if (arrastando) { e.preventDefault(); sec.classList.add("alvo-grupo"); } });
      sec.addEventListener("dragleave", e => { if (!sec.contains(e.relatedTarget)) sec.classList.remove("alvo-grupo"); });
      sec.addEventListener("drop", e => { e.preventDefault(); sec.classList.remove("alvo-grupo"); soltar(c.id, null); });
    }
    secTriunfo.push(sec);
  });

  if (secTriunfo.length) lista.append(el("div", { class: "bloco" }, secTriunfo));
  $("#vazio").hidden = achou > 0 || (editando && !q);

  const algumaLiberada = cats.some(c => c.restrita && !c.bloqueada) && !editando;
  $("#rodape-dir").replaceChildren(algumaLiberada
    ? el("button", { type: "button", onclick: travarTudo }, "Bloquear de novo as pastas com senha")
    : document.createTextNode("Quadros “Requer login” abrem só para quem tem acesso no Claude."));
}

function card(i, n){
  const c = catDe(i.cat) || { nome: "" };
  const o = origemDe(i.url);
  const abs = new URL(i.url, location.href).href;
  const novo = i.atualizado && diasDesde(i.atualizado) <= 7;
  const fav = favoritos.has(i.id);
  const art = el("article", { class: "card", "data-id": i.id, style: `--i:${Math.min(n || 0, 14)}` + (c.cor ? `;--cat:${c.cor}` : "") },
    editando ? el("span", { class: "card-alca", title: "Arraste para mover ou reordenar", "aria-hidden": "true", text: "⋮⋮" }) : null,
    el("a", { class: "card-corpo", href: i.url, target: "_blank", rel: "noopener" },
      el("div", { class: "card-topo" }, el("span", { class: "card-tipo", text: tipoDe(i) }), novo ? el("span", { class: "tag", text: "Novo" }) : null,
        o[1] === "login" ? el("span", { class: "badge", title: "Abre só para quem tem acesso no Claude" }, icone("cadeado"), "Requer login") : null),
      el("h3", {}, i.titulo, el("span", { class: "seta", "aria-hidden": "true", text: "→" })),
      i.descricao ? el("p", { class: "desc", text: i.descricao }) : null),
    el("div", { class: "card-rodape" }, el("span", { text: i.atualizado ? haQuanto(i.atualizado) : "Sem data", title: i.atualizado ? "Atualizado em " + dataCurta(i.atualizado) : "" }),
      el("div", { class: "acoes" },
        editando ? el("button", { type: "button", class: "icone editar-card", onclick: () => dialogoProjeto(i) }, "Editar") : null,
        el("button", { type: "button", class: "icone" + (fav ? " on" : ""), "aria-pressed": String(fav), title: fav ? "Remover dos favoritos" : "Fixar nos favoritos", "aria-label": "Favorito", html: IC.estrela,
          onclick: () => { fav ? favoritos.delete(i.id) : favoritos.add(i.id); salvarFavs(); render(); } }),
        el("button", { type: "button", class: "icone", title: "Copiar link", "aria-label": "Copiar link", html: IC.copiar, onclick: () => copiar(abs) }))));
  if (editando) {
    art.draggable = true;
    art.addEventListener("dragstart", e => { arrastando = i.id; art.classList.add("arrastando"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", i.id); });
    art.addEventListener("dragend", () => { arrastando = null; document.querySelectorAll(".arrastando,.alvo,.alvo-grupo").forEach(n => n.classList.remove("arrastando", "alvo", "alvo-grupo")); });
    art.addEventListener("dragover", e => { if (arrastando && arrastando !== i.id) { e.preventDefault(); e.stopPropagation(); art.classList.add("alvo"); } });
    art.addEventListener("dragleave", () => art.classList.remove("alvo"));
    art.addEventListener("drop", e => { e.preventDefault(); e.stopPropagation(); art.classList.remove("alvo"); soltar(i.cat, i.id); });
  }
  return art;
}

/* mover projeto: para o fim da pasta, ou antes de outro projeto */
function soltar(catId, antesDe){
  const id = arrastando; arrastando = null;
  const it = estado.itens.find(x => x.id === id);
  if (!it || id === antesDe) return;
  if (ordem !== "manual") { ordem = "manual"; ls.set("cp-ordem", ordem); }
  estado.itens = estado.itens.filter(x => x.id !== id);
  it.cat = catId;
  const pos = antesDe ? estado.itens.findIndex(x => x.id === antesDe) : -1;
  if (pos >= 0) estado.itens.splice(pos, 0, it); else {
    let ult = -1; estado.itens.forEach((x, k) => { if (x.cat === catId) ult = k; });
    estado.itens.splice(ult + 1, 0, it);
  }
  mudou();
}

async function copiar(url){
  try { await navigator.clipboard.writeText(url); toast("Link copiado"); }
  catch (e) { window.prompt("Copie o link:", url); }
}

/* ---------- janelas ---------- */
function abrirDialogo(titulo, sub, corpo, botoes){
  return new Promise(resolve => {
    const dlg = el("dialog");
    const form = el("form", { method: "dialog", onsubmit: e => e.preventDefault() },
      el("div", { class: "dlg-cab" }, el("h2", { text: titulo }), sub ? el("p", { text: sub }) : null),
      el("div", { class: "dlg-corpo" }, corpo),
      el("div", { class: "dlg-rod" }, botoes(dlg)));
    dlg.append(form); document.body.append(dlg);
    const fim = () => { if (dlg.isConnected) { dlg.remove(); resolve(); } };
    const fechar = dlg.close.bind(dlg);
    dlg.close = () => { fechar(); fim(); };
    dlg.addEventListener("close", fim);
    dlg.showModal();
  });
}
const campo = (rot, ctrl, dica) => el("div", { class: "campo" }, el("label", { text: rot }), ctrl, dica ? el("small", { text: dica }) : null);

function dialogoProjeto(it){
  const novo = !it;
  const base = it || { id: "", titulo: "", url: "", cat: (filtroCat !== "Todos" && catDe(filtroCat)) ? filtroCat : (estado.categorias[0] || {}).id, descricao: "", atualizado: hoje() };
  const fTit = el("input", { value: base.titulo, maxlength: "120", autocomplete: "off" });
  const fUrl = el("input", { value: base.url, maxlength: "600", placeholder: "https://… ou projetos/arquivo.html", autocomplete: "off" });
  const fDesc = el("textarea", { maxlength: "300" }); fDesc.value = base.descricao;
  const fCat = el("select"); estado.categorias.forEach(c => fCat.append(el("option", { value: c.id, text: c.nome })));
  fCat.append(el("option", { value: "__nova", text: "+ Nova pasta…" })); fCat.value = base.cat;
  const fNova = el("input", { placeholder: "Nome da nova pasta", maxlength: "60" }); const caixaNova = campo("Nova pasta", fNova); caixaNova.hidden = true;
  fCat.addEventListener("change", () => { caixaNova.hidden = fCat.value !== "__nova"; if (!caixaNova.hidden) fNova.focus(); });
  const fData = el("input", { type: "date", value: base.atualizado });
  const erro = el("div", { class: "dlg-erro", role: "alert" });
  return abrirDialogo(novo ? "Novo projeto" : "Editar projeto", novo ? "Aparece na Central assim que salvar." : "Renomeie, mude de pasta ou troque o link.",
    [campo("Nome do quadro", fTit), campo("Descrição (opcional)", fDesc), campo("Link", fUrl), campo("Pasta", fCat), caixaNova, campo("Atualizado em", fData), erro],
    dlg => [
      novo ? null : el("button", { type: "button", class: "btn perigo esq", onclick: () => { if (confirm(`Excluir "${base.titulo}" da Central?\n(O painel em si não é apagado, só o quadro.)`)) { estado.itens = estado.itens.filter(x => x.id !== base.id); dlg.close(); mudou(); toast("Projeto excluído"); } } }, "Excluir"),
      el("button", { type: "button", class: "btn", onclick: () => dlg.close() }, "Cancelar"),
      el("button", { type: "button", class: "btn primario", onclick: () => {
        const titulo = fTit.value.trim(), url = fUrl.value.trim();
        if (!titulo) return erro.textContent = "Dê um nome ao quadro.";
        if (!/^(https:\/\/|\/?projetos\/)/i.test(url)) return erro.textContent = "O link deve começar com https:// ou projetos/.";
        let cat = fCat.value;
        if (cat === "__nova") {
          const nome = fNova.value.trim(); if (!nome) return erro.textContent = "Digite o nome da nova pasta.";
          cat = criarCategoria(nome);
        }
        if (novo) { let id = slug(titulo), n = 2; while (estado.itens.some(x => x.id === id)) id = slug(titulo) + "-" + n++; estado.itens.push({ id, titulo, url, cat, descricao: fDesc.value.trim(), atualizado: fData.value }); }
        else Object.assign(it, { titulo, url, cat, descricao: fDesc.value.trim(), atualizado: fData.value });
        dlg.close(); mudou(); toast(novo ? "Projeto criado" : "Alterações salvas");
      } }, "Salvar")]);
}

function criarCategoria(nome){
  const ja = estado.categorias.find(c => norm(c.nome) === norm(nome)); if (ja) return ja.id;
  let id = slug(nome), n = 2; while (catDe(id)) id = slug(nome) + "-" + n++;
  estado.categorias.push({ id, nome, cor: CORES[estado.categorias.length % CORES.length], nota: "" });
  return id;
}

function dialogoCategorias(){
  const caixa = el("div", { style: "display:flex;flex-direction:column;gap:8px" });
  const desenhar = () => {
    caixa.replaceChildren();
    const n = {}; estado.itens.forEach(i => n[i.cat] = (n[i.cat] || 0) + 1);
    estado.categorias.forEach((c, k) => caixa.append(el("div", { class: "linha-cat" },
      iconeCat(c),
      el("div", {}, el("b", { text: c.nome }), el("small", { text: `${n[c.id] || 0} projeto(s)${c.restrita ? " · 🔒 com senha" : " · aberta"}` })),
      el("div", { class: "btns" },
        el("button", { type: "button", class: "btn", title: "Subir", disabled: k === 0 ? "disabled" : false, onclick: () => { [estado.categorias[k - 1], estado.categorias[k]] = [estado.categorias[k], estado.categorias[k - 1]]; mudou(); desenhar(); } }, "↑"),
        el("button", { type: "button", class: "btn", title: "Descer", disabled: k === estado.categorias.length - 1 ? "disabled" : false, onclick: () => { [estado.categorias[k + 1], estado.categorias[k]] = [estado.categorias[k], estado.categorias[k + 1]]; mudou(); desenhar(); } }, "↓"),
        el("button", { type: "button", class: "btn", onclick: () => dialogoUmaCategoria(c).then(desenhar) }, "Configurar")))));
    caixa.append(el("button", { type: "button", class: "btn", onclick: () => dialogoUmaCategoria(null).then(desenhar) }, "+ Nova pasta"));
  };
  desenhar();
  return abrirDialogo("Pastas e acessos", "Renomeie, escolha o ícone, a cor, a ordem e quem pode abrir cada pasta.", caixa, dlg => [el("button", { type: "button", class: "btn primario", onclick: () => dlg.close() }, "Fechar")]);
}

function dialogoUmaCategoria(c){
  const novo = !c;
  const base = c || { nome: "", cor: CORES[estado.categorias.length % CORES.length], nota: "", icone: "", restrita: false };
  let cor = base.cor;
  const fNome = el("input", { value: base.nome, maxlength: "60", autocomplete: "off" });
  const fNota = el("input", { value: base.nota, maxlength: "120", placeholder: "Ex.: Uso interno da equipe" });
  const fIcone = el("select", {}, el("option", { value: "", text: "Automático (pelo nome)" }), ...Object.keys(ICONES_CAT).map(k => el("option", { value: k, text: ROTULOS_ICONE[k] }))); fIcone.value = base.icone || "";
  const fAcesso = el("select", {}, el("option", { value: "aberto", text: "Aberta: qualquer pessoa com o link da Central" }), el("option", { value: "senha", text: "Protegida: só com a senha desta pasta" })); fAcesso.value = base.restrita ? "senha" : "aberto";
  const fSenha = el("input", { type: "password", autocomplete: "new-password", maxlength: "80", placeholder: base.restrita ? "Deixe em branco para manter a senha atual" : "Defina a senha desta pasta (mín. 4 caracteres)" });
  const caixaSenha = campo("Senha da pasta", fSenha, "Quem souber a senha vê os projetos e abre os painéis da pasta. Você, logado na edição, vê tudo.");
  const mostra = () => { caixaSenha.hidden = fAcesso.value !== "senha"; }; mostra(); fAcesso.addEventListener("change", mostra);
  const paleta = el("div", { class: "cores" });
  const pintar = () => { paleta.replaceChildren(...CORES.map(h => el("button", { type: "button", style: `background:${h}`, "aria-label": h, "aria-pressed": String(h.toLowerCase() === cor.toLowerCase()), onclick: () => { cor = h; pintar(); } }))); };
  pintar();
  const erro = el("div", { class: "dlg-erro", role: "alert" });
  return abrirDialogo(novo ? "Nova pasta" : "Configurar pasta", null, [campo("Nome", fNome), campo("Descrição curta (opcional)", fNota), campo("Ícone", fIcone), campo("Acesso", fAcesso), caixaSenha, campo("Cor", paleta), erro], dlg => {
    const usados = estado.itens.filter(i => c && i.cat === c.id).length;
    return [
      novo ? null : el("button", { type: "button", class: "btn perigo esq", disabled: usados ? "disabled" : false, title: usados ? "Mova os projetos para outra pasta antes de excluir." : "", onclick: () => { if (confirm(`Excluir a pasta "${c.nome}"?`)) { estado.categorias = estado.categorias.filter(x => x.id !== c.id); dlg.close(); mudou(); } } }, "Excluir"),
      el("button", { type: "button", class: "btn", onclick: () => dlg.close() }, "Cancelar"),
      el("button", { type: "button", class: "btn primario", onclick: async () => {
        const nome = fNome.value.trim(); if (!nome) return erro.textContent = "Dê um nome à pasta.";
        if (estado.categorias.some(x => x !== c && norm(x.nome) === norm(nome))) return erro.textContent = "Já existe uma pasta com esse nome.";
        const quer = fAcesso.value === "senha", nova = fSenha.value;
        if (quer && !base.restrita && nova.length < 4) return erro.textContent = "Defina uma senha de pelo menos 4 caracteres.";
        if (quer && nova && nova.length < 4) return erro.textContent = "A senha deve ter pelo menos 4 caracteres.";
        let alvo = c;
        if (novo) { let id = slug(nome), n = 2; while (catDe(id)) id = slug(nome) + "-" + n++; alvo = { id, nome, cor, nota: fNota.value.trim(), icone: fIcone.value }; estado.categorias.push(alvo); }
        else Object.assign(c, { nome, cor, nota: fNota.value.trim(), icone: fIcone.value });
        const mexerAcesso = (quer && nova) || (!quer && base.restrita);
        dlg.close(); mudou();
        if (mexerAcesso) {
          try { await gravando; const d = await chamarAcesso(alvo.id, quer ? nova : ""); alvo.restrita = d.restrita; render(); toast(d.restrita ? "Pasta protegida com senha" : "Pasta aberta para todos"); }
          catch (e) { toast("Não foi possível alterar o acesso: " + e.message); }
        }
      } }, "Salvar")];
  });
}

/* ---------- pastas protegidas ---------- */
function dialogoDesbloquear(c){
  const fSenha = el("input", { type: "password", autocomplete: "current-password" });
  const erro = el("div", { class: "dlg-erro", role: "alert" });
  const entrar = async dlg => {
    erro.textContent = "";
    try {
      const r = await fetch("/api/desbloquear", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cat: c.id, senha: fSenha.value }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return erro.textContent = d.erro || "Não foi possível liberar.";
      dlg.close(); await carregar(); render(); toast(`Pasta “${c.nome}” liberada`);
    } catch (e) { erro.textContent = "Sem conexão com o servidor."; }
  };
  return abrirDialogo(`Pasta protegida: ${c.nome}`, "Digite a senha desta pasta para ver e abrir os projetos.", [campo("Senha", fSenha), erro], dlg => {
    fSenha.addEventListener("keydown", e => { if (e.key === "Enter") entrar(dlg); });
    setTimeout(() => fSenha.focus(), 50);
    return [el("button", { type: "button", class: "btn", onclick: () => dlg.close() }, "Cancelar"), el("button", { type: "button", class: "btn primario", onclick: () => entrar(dlg) }, "Liberar")];
  });
}
async function travarTudo(){ try { await fetch("/api/travar", { method: "POST" }); } catch (e) {} await carregar(); render(); toast("Pastas protegidas bloqueadas de novo"); }

/* ---------- entrar / sair do modo edição ---------- */
function dialogoSenha(){
  const fSenha = el("input", { type: "password", autocomplete: "current-password" });
  const erro = el("div", { class: "dlg-erro", role: "alert" });
  const entrar = async dlg => {
    erro.textContent = "";
    try {
      const r = await fetch("/api/login", { method: "POST", headers: { "x-senha": fSenha.value } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return erro.textContent = d.erro || "Não foi possível entrar.";
      senha = fSenha.value; ss.set("cp-senha", senha); editando = true; dlg.close(); await carregar(); render(); estadoSalvar("Conectado");
    } catch (e) { erro.textContent = "Sem conexão com o servidor."; }
  };
  return abrirDialogo("Editar a Central", "Digite a senha de edição para renomear quadros, mudar pastas, acessos e reordenar.", [campo("Senha", fSenha), erro], dlg => {
    fSenha.addEventListener("keydown", e => { if (e.key === "Enter") entrar(dlg); });
    setTimeout(() => fSenha.focus(), 50);
    return [el("button", { type: "button", class: "btn", onclick: () => dlg.close() }, "Cancelar"),
      el("button", { type: "button", class: "btn primario", onclick: () => entrar(dlg) }, "Entrar")];
  });
}
async function sair(){
  editando = false; senha = ""; ss.set("cp-senha", "");
  try { await fetch("/api/travar", { method: "POST" }); } catch (e) {}
  await carregar(); render();
}

async function alternarEdicao(){
  if (editando) return sair();
  if (!apiOk) return toast("Edição indisponível: o servidor da lista não respondeu.");
  if (!editavelNoServidor) return alert("A edição ainda não foi ativada.\n\nNa Cloudflare, abra o Worker central-de-projetos > Settings > Variables and Secrets e crie o segredo EDIT_PASSWORD com a senha que você quiser.");
  if (senha) { editando = true; return render(); }
  dialogoSenha();
}

/* ---------- início ---------- */
(async function(){
  $("#busca").addEventListener("input", render);
  $("#temaClaro").onclick = () => aplicarTema("claro");
  $("#temaEscuro").onclick = () => aplicarTema("escuro");
  $("#vGrade").onclick = () => { visao = "grade"; ls.set("cp-visao", visao); render(); };
  $("#vLista").onclick = () => { visao = "lista"; ls.set("cp-visao", visao); render(); };
  $("#ordem").onchange = e => { ordem = e.target.value; ls.set("cp-ordem", ordem); render(); };
  $("#btnEditar").onclick = alternarEdicao;
  $("#btnNovo").onclick = () => dialogoProjeto(null);
  $("#btnCats").onclick = dialogoCategorias;
  $("#btnLimpar").onclick = () => { $("#busca").value = ""; filtroCat = "Todos"; ls.set("cp-filtro", "Todos"); render(); };
  document.addEventListener("keydown", e => {
    const campoAtivo = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (e.key === "/" && !campoAtivo && !document.querySelector("dialog[open]")) { e.preventDefault(); $("#busca").focus(); }
    else if (e.key === "Escape" && document.activeElement === $("#busca")) { $("#busca").value = ""; $("#busca").blur(); render(); }
  });
  aplicarTema(document.documentElement.dataset.tema || "claro");
  await carregar();
  if (senha && apiOk && editavelNoServidor) editando = true;
  render();
  if (editando) estadoSalvar("Conectado");
  /* link vindo de um painel protegido: ?pasta=id abre a janela de senha */
  const pasta = new URLSearchParams(location.search).get("pasta");
  if (pasta) { const c = catDe(pasta); if (c && c.bloqueada) dialogoDesbloquear(c); history.replaceState(null, "", location.pathname); }
})();
