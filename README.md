# Central de Projetos

Site na Cloudflare (Workers + arquivos estáticos). A lista de quadros e categorias fica editável no próprio site (botão **Editar**) e é gravada no KV `CENTRAL_KV` via `src/worker.js`.

- Segredo obrigatório: `EDIT_PASSWORD` (Cloudflare > Worker > Settings > Variables and Secrets).
- `projetos.js` é só a lista inicial: vale até a primeira gravação online; depois o KV manda.
- Painéis novos: coloque o HTML em `projetos/` e crie o quadro pelo botão Editar > + Novo projeto (link `projetos/arquivo.html`).
