/* Central de Projetos: lista agrupada por categoria, editável online (API do Worker + KV). */
const $ = s => document.querySelector(s);
const TIPOS = [[/painel da equipe/i,"Editor"],[/boletim/i,"Boletim"],[/painel/i,"Painel"],[/planejamento/i,"Planejamento"],[/cen[aá]rio/i,"Cenários"],
  [/indicador/i,"Indicadores"],[/controle/i,"Controle"],[/central/i,"Central"],[/alinhamento/i,"Alinhamento"],[/docagem/i,"Docagem"],[/obra/i,"Obras"],[/gest[aã]o/i,"Gestão"]];
const tipoDe = i => (TIPOS.find(([re]) => re.test(i.titulo)) || [0, "Projeto"])[1];
const CORES = ["#DA202C","#7B4FB8","#2F6FDE","#14A3A3","#E8772B","#8A8C91","#3C9D4E","#C23A8A"];
const COR_PADRAO = { "Boletins de navio":"#DA202C", "Área da equipe":"#7B4FB8", "TPS":"#2F6FDE", "Prime Ocean":"#14A3A3", "Operações":"#E8772B", "Pessoal":"#8A8C91" };
const NOTA_PADRAO = { "Boletins de navio":"Dados ao vivo da planilha da equipe", "Área da equipe":"Uso interno: configurar e gerar envios" };
const MES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const dataCurta = s => { if (!s) return ''; const [a, m, d] = s.split('-').map(Number); return `${d} ${MES[m - 1]} ${a}`; };
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const haQuanto = s => { const [a, m, d] = s.split('-').map(Number); const dias = Math.round((new Date().setHours(0,0,0,0) - new Date(a, m - 1, d)) / 864e5);
  return dias <= 0 ? 'atualizado hoje' : dias === 1 ? 'há 1 dia' : dias < 30 ? `há ${dias} dias` : `há ${Math.round(dias / 30)} ${Math.round(dias / 30) === 1 ? 'mês' : 'meses'}`; };
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const slug = s => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "item";
const ls = { get(k, p) { try { return localStorage.getItem(k) ?? p; } catch (e) { return p; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const ss = { get(k) { try { return sessionStorage.getItem(k) || ""; } catch (e) { return ""; } }, set(k, v) { try { v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch (e) {} } };

function el(tag, attrs, ...kids){ const e = document.createElement(tag); for (const k in attrs || {}){ if (k === "text") e.textContent = attrs[k]; else if (k.startsWith("on")) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]); } kids.flat().forEach(c => c != null && c !== false && e.append(c)); return e; }

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
    const r = await fetch("/api/projetos", { cache: "no-store" });
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

let tToast;
function toast(msg){ let t = $("#toast"); if (!t) { t = el("div", { id: "toast", role: "status" }); document.body.append(t); } t.textContent = msg; t.hidden = false; clearTimeout(tToast); tToast = setTimeout(() => t.hidden = true, 3200); }

/* ---------- derivados ---------- */
const catDe = id => estado.categorias.find(c => c.id === id);
function origemDe(url){ if (!/^https?:/i.test(url)) return ["Abre sem login", "livre"]; if (/claude\.ai/i.test(url)) return ["Requer login", "login"]; return ["Link externo", "externo"]; }
const ordenadores = {
  manual: null,
  recentes: (a, b) => (b.atualizado || "").localeCompare(a.atualizado || "") || a.titulo.localeCompare(b.titulo),
  az: (a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"),
};

/* ---------- desenho ---------- */
function render(){
  const cats = estado.categorias, itens = estado.itens;
  const cont = {}; itens.forEach(i => cont[i.cat] = (cont[i.cat] || 0) + 1);
  if (filtroCat !== "Todos" && !catDe(filtroCat)) filtroCat = "Todos";
  document.body.classList.toggle("editando", editando);
  document.body.classList.toggle("lista", visao === "lista");
  $("#r-total").textContent = itens.length;
  $("#r-cat").textContent = cats.filter(c => cont[c.id]).length;
  const livres = itens.filter(i => !/^https?:/i.test(i.url)).length, pct = itens.length ? livres / itens.length * 100 : 0;
  $("#r-livre").textContent = livres;
  $("#r-livre-pct").textContent = `${Math.round(pct)}% dos projetos`;
  $("#r-livre-barra").style.width = pct + "%";
  const recente = itens.filter(i => i.atualizado).sort(ordenadores.recentes)[0];
  $("#r-ult").textContent = recente ? dataCurta(recente.atualizado).replace(/ \d{4}$/, '') : "—";
  $("#r-ult-nome").textContent = recente ? recente.titulo : "";
  $("#sub").textContent = `Triunfo Logística · ${itens.length} projetos em ${cats.filter(c => cont[c.id]).length} frentes`;

  const chips = $("#chips"); chips.replaceChildren();
  [{ id: "Todos", nome: "Todos" }, ...cats.filter(c => cont[c.id] || editando)].forEach(c => chips.append(el("button", { type: "button", class: "chip", "aria-pressed": String(c.id === filtroCat),
    onclick: () => { filtroCat = c.id; ls.set("cp-filtro", c.id); render(); } }, c.nome, el("span", { class: "n", text: c.id === "Todos" ? itens.length : (cont[c.id] || 0) }))));
  $("#ordem").value = ordem;
  $("#vGrade").setAttribute("aria-pressed", String(visao !== "lista"));
  $("#vLista").setAttribute("aria-pressed", String(visao === "lista"));
  $("#btnEditar").textContent = editando ? "Sair da edição" : "Editar";
  $("#faixa-edicao").hidden = !editando;

  const q = norm($("#busca").value.trim());
  const ord = ordenadores[ordem];
  const lista = $("#lista"); lista.replaceChildren();
  let achou = 0;
  cats.forEach(c => {
    if (filtroCat !== "Todos" && filtroCat !== c.id) return;
    let vis = itens.filter(i => i.cat === c.id && (!q || norm(i.titulo + " " + i.descricao + " " + c.nome).includes(q)));
    if (ord) vis = vis.slice().sort(ord);
    if (!vis.length && (q || !editando)) return;
    achou += vis.length;
    const fechado = fechados.has(c.id) && !q;
    const sec = el("section", { class: "grupo" + (fechado ? " fechado" : ""), style: `--cat:${c.cor}`, "data-cat": c.id },
      el("div", { class: "grupo-cab" }, el("span", { class: "ponto" }), el("h2", { text: c.nome }), el("span", { class: "qtd", text: String(vis.length) }),
        (c.nota ? el("span", { class: "nota", text: c.nota }) : null),
        el("button", { type: "button", class: "recolher", "aria-expanded": String(!fechado), onclick: () => { fechado ? fechados.delete(c.id) : fechados.add(c.id); ls.set("cp-fechados", JSON.stringify([...fechados])); render(); } }, fechado ? "Mostrar ▾" : "Recolher ▴")),
      vis.length ? el("div", { class: "grade" }, vis.map(card)) : el("div", { class: "grade-vazia", text: "Categoria vazia. Arraste um projeto para cá ou crie um novo." }));
    if (editando) {
      sec.addEventListener("dragover", e => { if (arrastando) { e.preventDefault(); sec.classList.add("alvo-grupo"); } });
      sec.addEventListener("dragleave", e => { if (!sec.contains(e.relatedTarget)) sec.classList.remove("alvo-grupo"); });
      sec.addEventListener("drop", e => { e.preventDefault(); sec.classList.remove("alvo-grupo"); soltar(c.id, null); });
    }
    lista.append(sec);
  });
  $("#vazio").hidden = achou > 0 || (editando && !q);
}

function card(i){
  const c = catDe(i.cat) || { nome: "" };
  const o = origemDe(i.url);
  const abs = new URL(i.url, location.href).href;
  const art = el("article", { class: "card", "data-id": i.id },
    editando ? el("span", { class: "card-alca", title: "Arraste para mover ou reordenar", "aria-hidden": "true", text: "⋮⋮" }) : null,
    el("a", { class: "card-corpo", href: i.url, target: "_blank", rel: "noopener" },
      el("div", { class: "card-topo" }, el("span", { class: "card-tipo", text: tipoDe(i) }), el("span", { class: "badge " + o[1], text: o[0] })),
      el("h3", { text: i.titulo }),
      i.descricao ? el("p", { class: "desc", text: i.descricao }) : null,
      el("div", { class: "card-meta" }, el("span", { text: c.nome }), i.atualizado ? el("span", { text: haQuanto(i.atualizado) }) : null)),
    el("div", { class: "card-rodape" }, el("span", { text: i.atualizado ? "Atualizado em " + dataCurta(i.atualizado) : "Sem data" }),
      el("div", { class: "acoes" },
        editando ? el("button", { type: "button", class: "icone editar-card", onclick: () => dialogoProjeto(i) }, "Editar") : null,
        el("button", { type: "button", class: "icone", onclick: e => copiar(abs, e.currentTarget) }, "Copiar link"),
        el("a", { class: "abrir", href: i.url, target: "_blank", rel: "noopener", "aria-hidden": "true", tabindex: "-1" }, "Abrir →"))));
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

/* mover projeto: para o fim da categoria, ou antes de outro projeto */
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

async function copiar(url, btn){
  try { await navigator.clipboard.writeText(url); btn.textContent = "Copiado"; setTimeout(() => btn.textContent = "Copiar link", 1600); }
  catch (e) { const inp = el("input", { value: url, "aria-label": "Link" }); inp.style.width = "100%"; btn.replaceWith(inp); inp.select(); }
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
const campo = (rot, ctrl) => el("div", { class: "campo" }, el("label", { text: rot }), ctrl);

function dialogoProjeto(it){
  const novo = !it;
  const base = it || { id: "", titulo: "", url: "", cat: (filtroCat !== "Todos" && catDe(filtroCat)) ? filtroCat : (estado.categorias[0] || {}).id, descricao: "", atualizado: hoje() };
  const fTit = el("input", { value: base.titulo, maxlength: "120", autocomplete: "off" });
  const fUrl = el("input", { value: base.url, maxlength: "600", placeholder: "https://… ou projetos/arquivo.html", autocomplete: "off" });
  const fDesc = el("textarea", { maxlength: "300" }); fDesc.value = base.descricao;
  const fCat = el("select"); estado.categorias.forEach(c => fCat.append(el("option", { value: c.id, text: c.nome })));
  fCat.append(el("option", { value: "__nova", text: "+ Nova categoria…" })); fCat.value = base.cat;
  const fNova = el("input", { placeholder: "Nome da nova categoria", maxlength: "60" }); const caixaNova = campo("Nova categoria", fNova); caixaNova.hidden = true;
  fCat.addEventListener("change", () => { caixaNova.hidden = fCat.value !== "__nova"; if (!caixaNova.hidden) fNova.focus(); });
  const fData = el("input", { type: "date", value: base.atualizado });
  const erro = el("div", { class: "dlg-erro", role: "alert" });
  return abrirDialogo(novo ? "Novo projeto" : "Editar projeto", novo ? "Aparece na Central assim que salvar." : "Renomeie, mude de categoria ou troque o link.",
    [campo("Nome do quadro", fTit), campo("Descrição (opcional)", fDesc), campo("Link", fUrl), campo("Categoria", fCat), caixaNova, campo("Atualizado em", fData), erro],
    dlg => [
      novo ? null : el("button", { type: "button", class: "btn perigo esq", onclick: () => { if (confirm(`Excluir "${base.titulo}" da Central?\n(O painel em si não é apagado, só o quadro.)`)) { estado.itens = estado.itens.filter(x => x.id !== base.id); dlg.close(); mudou(); toast("Projeto excluído"); } } }, "Excluir"),
      el("button", { type: "button", class: "btn", onclick: () => dlg.close() }, "Cancelar"),
      el("button", { type: "button", class: "btn primario", onclick: () => {
        const titulo = fTit.value.trim(), url = fUrl.value.trim();
        if (!titulo) return erro.textContent = "Dê um nome ao quadro.";
        if (!/^(https:\/\/|\/?projetos\/)/i.test(url)) return erro.textContent = "O link deve começar com https:// ou projetos/.";
        let cat = fCat.value;
        if (cat === "__nova") {
          const nome = fNova.value.trim(); if (!nome) return erro.textContent = "Digite o nome da nova categoria.";
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
      el("span", { class: "ponto", style: `background:${c.cor}` }),
      el("div", {}, el("b", { text: c.nome }), el("small", { text: `${n[c.id] || 0} projeto(s)` })),
      el("div", { class: "btns" },
        el("button", { type: "button", class: "btn", title: "Subir", disabled: k === 0 ? "disabled" : false, onclick: () => { [estado.categorias[k - 1], estado.categorias[k]] = [estado.categorias[k], estado.categorias[k - 1]]; mudou(); desenhar(); } }, "↑"),
        el("button", { type: "button", class: "btn", title: "Descer", disabled: k === estado.categorias.length - 1 ? "disabled" : false, onclick: () => { [estado.categorias[k + 1], estado.categorias[k]] = [estado.categorias[k], estado.categorias[k + 1]]; mudou(); desenhar(); } }, "↓"),
        el("button", { type: "button", class: "btn", onclick: () => dialogoUmaCategoria(c).then(desenhar) }, "Editar")))));
    caixa.append(el("button", { type: "button", class: "btn", onclick: () => dialogoUmaCategoria(null).then(desenhar) }, "+ Nova categoria"));
  };
  desenhar();
  return abrirDialogo("Categorias", "Renomeie, mude a cor, a ordem ou crie novas categorias.", caixa, dlg => [el("button", { type: "button", class: "btn primario", onclick: () => dlg.close() }, "Fechar")]);
}

function dialogoUmaCategoria(c){
  const novo = !c;
  const base = c || { nome: "", cor: CORES[estado.categorias.length % CORES.length], nota: "" };
  let cor = base.cor;
  const fNome = el("input", { value: base.nome, maxlength: "60", autocomplete: "off" });
  const fNota = el("input", { value: base.nota, maxlength: "120", placeholder: "Ex.: Uso interno da equipe" });
  const paleta = el("div", { class: "cores" });
  const pintar = () => { paleta.replaceChildren(...CORES.map(h => el("button", { type: "button", style: `background:${h}`, "aria-label": h, "aria-pressed": String(h.toLowerCase() === cor.toLowerCase()), onclick: () => { cor = h; pintar(); } }))); };
  pintar();
  const erro = el("div", { class: "dlg-erro", role: "alert" });
  return abrirDialogo(novo ? "Nova categoria" : "Editar categoria", null, [campo("Nome", fNome), campo("Descrição curta (opcional)", fNota), campo("Cor", paleta), erro], dlg => {
    const usados = estado.itens.filter(i => c && i.cat === c.id).length;
    return [
      novo ? null : el("button", { type: "button", class: "btn perigo esq", disabled: usados ? "disabled" : false, title: usados ? "Mova os projetos para outra categoria antes de excluir." : "", onclick: () => { if (confirm(`Excluir a categoria "${c.nome}"?`)) { estado.categorias = estado.categorias.filter(x => x.id !== c.id); dlg.close(); mudou(); } } }, "Excluir"),
      el("button", { type: "button", class: "btn", onclick: () => dlg.close() }, "Cancelar"),
      el("button", { type: "button", class: "btn primario", onclick: () => {
        const nome = fNome.value.trim(); if (!nome) return erro.textContent = "Dê um nome à categoria.";
        if (estado.categorias.some(x => x !== c && norm(x.nome) === norm(nome))) return erro.textContent = "Já existe uma categoria com esse nome.";
        if (novo) { let id = slug(nome), n = 2; while (catDe(id)) id = slug(nome) + "-" + n++; estado.categorias.push({ id, nome, cor, nota: fNota.value.trim() }); }
        else Object.assign(c, { nome, cor, nota: fNota.value.trim() });
        dlg.close(); mudou();
      } }, "Salvar")];
  });
}

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
      senha = fSenha.value; ss.set("cp-senha", senha); editando = true; dlg.close(); render(); estadoSalvar("Conectado");
    } catch (e) { erro.textContent = "Sem conexão com o servidor."; }
  };
  return abrirDialogo("Editar a Central", "Digite a senha de edição para renomear quadros, mudar categorias e reordenar.", [campo("Senha", fSenha), erro], dlg => {
    fSenha.addEventListener("keydown", e => { if (e.key === "Enter") entrar(dlg); });
    return [el("button", { type: "button", class: "btn", onclick: () => dlg.close() }, "Cancelar"),
      el("button", { type: "button", class: "btn primario", onclick: () => entrar(dlg) }, "Entrar")];
  });
}
function sair(){ editando = false; senha = ""; ss.set("cp-senha", ""); render(); }

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
  aplicarTema(document.documentElement.dataset.tema || "claro");
  await carregar();
  if (senha && apiOk && editavelNoServidor) editando = true;
  render();
  if (editando) estadoSalvar("Conectado");
})();
