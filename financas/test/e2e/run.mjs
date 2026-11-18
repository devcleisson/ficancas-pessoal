// Teste de ponta a ponta no navegador (Chrome) contra o app em produção
// (`next start`) e o Supabase simulado (test/e2e/mock-supabase.mjs).
//
//   node test/e2e/mock-supabase.mjs &
//   npm run build && npx next start -p 3000 &
//   node test/e2e/run.mjs
import puppeteer from "puppeteer-core";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.E2E_OUT ?? "/tmp/e2e";
const DL = join(OUT, "downloads");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(DL, { recursive: true });

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const br = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const today = new Date();
const plus = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=pt-BR"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const cdp = await page.createCDPSession();
await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DL });

const problems = [];
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource.*(400|401|403|406|409)/.test(m.text())) problems.push(`console: ${m.text()}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

let step = 0;
const results = [];
async function check(name, fn) {
  step++;
  try {
    await fn();
    results.push(`✔ ${step}. ${name}`);
    console.log(`✔ ${step}. ${name}`);
  } catch (e) {
    results.push(`✘ ${step}. ${name} — ${e.message}`);
    console.log(`✘ ${step}. ${name} — ${e.message}`);
    await page.screenshot({ path: join(OUT, `fail-${step}.png`), fullPage: true });
  }
}
const assert = (c, msg) => { if (!c) throw new Error(msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const bodyText = () => page.evaluate(() => document.body.innerText.replace(/ /g, " "));
async function waitText(text, timeout = 8000) {
  await page.waitForFunction((t) => document.body.innerText.replace(/ /g, " ").includes(t), { timeout }, text).catch(async () => {
    throw new Error(`texto não encontrado: "${text}"`);
  });
}
async function waitNoText(text, timeout = 8000) {
  await page.waitForFunction((t) => !document.body.innerText.replace(/ /g, " ").includes(t), { timeout }, text).catch(() => {
    throw new Error(`texto ainda presente: "${text}"`);
  });
}
async function go(path) {
  await page.goto(BASE + path, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), { timeout: 15000 });
}
async function clickButton(text, scope = "body") {
  const handle = await page.waitForFunction((t, s) => {
    const root = [...document.querySelectorAll(s)].pop();
    return [...root.querySelectorAll("button, a, [role=menuitem], [role=option], [role=radio], [role=tab]")].find(
      (b) => b.innerText.replace(/\s+/g, " ").trim() === t && !b.disabled && b.offsetParent !== null,
    );
  }, { timeout: 8000 }, text, scope).catch(() => { throw new Error(`botão não encontrado: "${text}"`); });
  await handle.asElement().click();
  await sleep(150);
}
const inDialog = '[role="dialog"], [role="alertdialog"]';
async function setInput(selector, value) {
  await page.waitForSelector(selector, { timeout: 8000 });
  await page.$eval(selector, (el, v) => {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}
async function type(selector, value) {
  await page.waitForSelector(selector, { timeout: 8000 });
  await page.focus(selector);
  await page.$eval(selector, (el) => el.select?.());
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.type(selector, value);
}
async function choose(label, option) {
  const trigger = `[role="dialog"] [aria-label="${label}"]`;
  await page.waitForSelector(trigger, { timeout: 8000 });
  await page.click(trigger);
  await page.waitForSelector('[role="option"]', { timeout: 5000 });
  await clickButton(option, '[role="listbox"]');
  await sleep(150);
}
async function chooseOutside(label, option) {
  await page.click(`[aria-label="${label}"]`);
  await page.waitForSelector('[role="option"]', { timeout: 5000 });
  await clickButton(option, '[role="listbox"]');
  await sleep(150);
}
async function dialogClosed() {
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]') && getComputedStyle(document.body).pointerEvents !== "none", { timeout: 8000 }).catch(() => { throw new Error("o formulário não fechou"); });
  await sleep(250);
}
async function shot(name, full = true) {
  // Em vez de fullPage (que redimensiona a janela durante a captura e distorce
  // os gráficos), aumentamos a altura da janela antes de capturar.
  const vp = page.viewport();
  if (full) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewport({ ...vp, height: Math.min(h, 6000) });
  }
  await sleep(1200);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  if (full) await page.setViewport(vp);
}

const email = `teste${Date.now()}@exemplo.com`;
const password = "Senha1234";

// ---------------------------------------------------------------------------
await check("redireciona para o login sem sessão", async () => {
  await page.goto(BASE + "/", { waitUntil: "networkidle0" });
  assert(page.url().endsWith("/login"), `url ${page.url()}`);
  await shot("01-login", false);
});

await check("cadastro valida senha e cria conta", async () => {
  await go("/cadastro");
  await type("#name", "Cleisson");
  await type("#email", email);
  await type("#password", "curta");
  await type("#confirm", "curta");
  await clickButton("Criar conta");
  await waitText("pelo menos 8 caracteres");
  await type("#password", password);
  await type("#confirm", password);
  await clickButton("Criar conta");
  await page.waitForFunction(() => location.pathname === "/", { timeout: 10000 });
  await waitText("Visão geral");
  await waitText("Primeiros passos");
  await waitText("Cleisson");
  await shot("02-dashboard-vazio");
});

await check("cadastra contas bancária e poupança", async () => {
  await go("/contas");
  await clickButton("Nova conta");
  await type("#acc-name", "Banco Teste");
  await type("#acc-initial", "1.000,00");
  await clickButton("Salvar", inDialog);
  await dialogClosed();
  await waitText("Banco Teste");
  await clickButton("Nova conta");
  await type("#acc-name", "Poupança");
  await choose("Tipo de conta", "Poupança");
  await type("#acc-initial", "500");
  await clickButton("Salvar", inDialog);
  await dialogClosed();
  await waitText("R$ 1.500,00"); // saldo total em contas
});

await check("valida formulário de despesa vazio", async () => {
  await go("/despesas");
  await clickButton("Nova despesa");
  await clickButton("Salvar", inDialog);
  await waitText("Informe o nome da despesa.");
  await waitText("Informe um valor válido.");
  await waitText("Escolha uma categoria.");
  await page.keyboard.press("Escape");
  await dialogClosed();
});

await check("cadastra receita", async () => {
  await go("/receitas");
  await clickButton("Nova receita");
  await type("#tx-desc", "Salário");
  await type("#tx-amount", "5.000,00");
  await choose("Categoria", "Salário");
  await choose("Conta", "Banco Teste");
  await type("#tx-source", "Empresa");
  await clickButton("Salvar", inDialog);
  await dialogClosed();
  await waitText("Receita cadastrada.");
  await waitText("R$ 5.000,00");
});

await check("cadastra despesa paga e despesa pendente", async () => {
  await go("/despesas");
  await clickButton("Nova despesa");
  await type("#tx-desc", "Mercado");
  await type("#tx-amount", "120,50");
  await choose("Categoria", "Alimentação");
  await choose("Conta", "Banco Teste");
  await clickButton("Salvar", inDialog);
  await dialogClosed();
  await clickButton("Nova despesa");
  await type("#tx-desc", "Aluguel");
  await type("#tx-amount", "1500");
  await choose("Categoria", "Moradia");
  await setInput("#tx-date", iso(plus(3)));
  await clickButton("Pendente", inDialog);
  await clickButton("Fixa", inDialog);
  await clickButton("Salvar", inDialog);
  await dialogClosed();
  await waitText("Aluguel");
  await waitText("R$ 1.500,00"); // pendentes
  await shot("03-despesas");
});

await check("cartão: cadastro, compra parcelada, limite e pagamento da fatura", async () => {
  await go("/cartoes");
  await clickButton("Novo cartão");
  await type("#card-name", "Cartão Teste");
  await type("#card-limit", "2.000");
  await type("#card-close", "5");
  await type("#card-due", "12");
  await clickButton("Salvar", inDialog);
  await dialogClosed();
  await waitText("Cartão Teste");
  await clickButton("Compra");
  await type("#tx-desc", "Notebook");
  await type("#tx-amount", "1.200,00");
  await choose("Categoria", "Tecnologia");
  await choose("Parcelas", "3x");
  await waitText("3x de R$ 400,00");
  await clickButton("Salvar", inDialog);
  await dialogClosed();
  await waitText("Compra parcelada em 3x registrada.");
  await waitText("R$ 800,00"); // limite disponível
  await waitText("Notebook");
  await clickButton("Pagar fatura");
  await choose("Conta", "Banco Teste");
  await clickButton("Confirmar pagamento", inDialog);
  await dialogClosed();
  await waitText("Pagamento da fatura registrado.");
  await waitText("Paga");
  await waitText("R$ 1.200,00"); // limite disponível após pagar 400
  await shot("04-cartoes");
});

await check("orçamento: limite e alerta de 70%", async () => {
  await go("/orcamento");
  await clickButton("Definir limite");
  await choose("Categoria", "Alimentação");
  await type("#bud-amount", "150");
  await clickButton("Salvar", inDialog);
  await dialogClosed();
  await waitText("Atingiu 70%");
  await waitText("já usou 80,3% do orçamento");
  await shot("05-orcamento");
});

await check("contas recorrentes: atrasada e pagamento avança vencimento", async () => {
  await go("/recorrentes");
  await clickButton("Nova conta recorrente");
  await type("#bill-name", "Internet");
  await type("#bill-amount", "99,90");
  await setInput("#bill-date", iso(plus(-1)));
  await clickButton("Salvar", inDialog);
  await dialogClosed();
  await waitText("Atrasadas");
  await shot("06-recorrentes-atrasada");
  await clickButton("Pagar");
  await choose("Conta", "Banco Teste");
  await clickButton("Confirmar pagamento", inDialog);
  await dialogClosed();
  const next = new Date(plus(-1)); next.setMonth(next.getMonth() + 1);
  await waitText(`Próximo vencimento em ${br(next)}`);
  await waitNoText("Atrasadas (");
});

await check("metas: criação com valor acumulado e aporte", async () => {
  await go("/metas");
  await clickButton("Nova meta");
  await type("#goal-name", "Reserva de emergência");
  await type("#goal-target", "10.000");
  await type("#goal-initial", "1.000");
  await setInput("#goal-deadline", iso(new Date(today.getFullYear() + 1, today.getMonth(), 28)));
  await clickButton("Salvar", inDialog);
  await dialogClosed();
  await waitText("Reserva de emergência");
  await clickButton("Adicionar valor");
  await type("#gc-amount", "500");
  await clickButton("Adicionar", inDialog);
  await dialogClosed();
  await waitText("R$ 1.500,00");
  await waitText("15%");
  await shot("07-metas");
});

await check("dashboard calcula os indicadores com os dados cadastrados", async () => {
  await go("/");
  // Banco: 1000 + 5000 − 120,50 − 400 (fatura) − 99,90 = 5.379,60 · Poupança 500 · Carteira 0
  await waitText("R$ 5.879,60");
  await waitText("R$ 5.000,00");
  // Despesas do mês: 120,50 + 1.500 + 400 (1ª parcela) + 99,90 = 2.120,40
  await waitText("R$ 2.120,40");
  await waitText("+R$ 2.879,60");
  // Guardado: 500 poupança + 1.500 metas
  await waitText("R$ 2.000,00");
  await waitText("42,4%"); // renda comprometida
  await shot("08-dashboard");
});

await check("dados persistem após recarregar", async () => {
  await page.reload({ waitUntil: "networkidle0" });
  await waitText("R$ 5.879,60");
});

await check("busca, edição e exclusão de movimentações", async () => {
  await go("/movimentacoes");
  await type('input[aria-label="Buscar"]', "mercado");
  await waitNoText("Aluguel");
  await waitText("Mercado");
  await page.click('button[aria-label="Ações de Mercado"]');
  await clickButton("Editar", '[role="menu"]');
  await type("#tx-amount", "130");
  await clickButton("Salvar alterações", inDialog);
  await dialogClosed();
  await waitText("R$ 130,00");
  await type('input[aria-label="Buscar"]', "aluguel");
  await page.waitForSelector('button[aria-label="Ações de Aluguel"]');
  await page.click('button[aria-label="Ações de Aluguel"]');
  await clickButton("Excluir", '[role="menu"]');
  await clickButton("Excluir", '[role="alertdialog"]');
  await waitText("Lançamento excluído.");
  await waitText("Nenhum lançamento encontrado");
});

await check("filtros por categoria e forma de pagamento", async () => {
  await go("/movimentacoes");
  await clickButton("Filtros");
  await chooseOutside("Forma de pagamento", "Cartão de crédito");
  await waitText("Notebook");
  await waitNoText("Salário");
  await chooseOutside("Forma de pagamento", "Todas as formas");
  await chooseOutside("Categoria", "Salário");
  await waitText("Salário");
  await waitNoText("Notebook");
});

await check("busca global (Ctrl+K)", async () => {
  await go("/");
  await page.keyboard.down("Control");
  await page.keyboard.press("k");
  await page.keyboard.up("Control");
  await page.waitForSelector("[cmdk-input]");
  await page.type("[cmdk-input]", "notebook");
  await waitText("Movimentações (3)");
  await shot("09-busca", false);
  await page.keyboard.press("Escape");
});

// Mercado passou de 120,50 para 130,00: saldo 5.879,60 − 9,50 = 5.870,10
await check("notificações e ocultar valores", async () => {
  await go("/");
  await page.click('button[aria-label^="Notificações"]');
  await waitText("Alimentação chegou a 70% do orçamento");
  await page.keyboard.press("Escape");
  await page.click('button[aria-label="Ocultar valores"]');
  await waitText("R$ •••••");
  await waitNoText("R$ 5.870,10");
  await shot("10-valores-ocultos", false);
  await page.click('button[aria-label="Mostrar valores"]');
  await waitText("R$ 5.870,10");
});

await check("relatórios exportam CSV e PDF", async () => {
  await go("/relatorios");
  await waitText("Comparativo entre meses");
  await clickButton("CSV");
  await clickButton("PDF");
  await sleep(2500);
  const files = readdirSync(DL);
  const csv = files.find((f) => f.endsWith(".csv"));
  const pdf = files.find((f) => f.endsWith(".pdf"));
  assert(csv && pdf, `downloads: ${files.join(", ")}`);
  const content = readFileSync(join(DL, csv), "utf8");
  assert(content.includes("Notebook") && content.includes("Salário") && content.includes("400,00"), "conteúdo do CSV");
  assert(readFileSync(join(DL, pdf)).subarray(0, 4).toString() === "%PDF", "PDF inválido");
  await shot("11-relatorios");
});

await check("calendário e configurações carregam", async () => {
  await go("/calendario");
  await waitText("Calendário financeiro");
  await shot("12-calendario");
  await go("/configuracoes");
  await waitText("Importação e exportação");
  await clickButton("Claro");
  await sleep(300);
  await shot("13-configuracoes-claro");
  await go("/");
  await shot("14-dashboard-claro");
  await go("/configuracoes");
  await clickButton("Escuro");
});

await check("layout responsivo no celular", async () => {
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await go("/");
  await shot("15-mobile-dashboard");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!overflow, "rolagem horizontal no celular");
  await page.click('button[aria-label="Abrir menu"]');
  await waitText("Contas fixas");
  await shot("16-mobile-menu", false);
  await page.keyboard.press("Escape");
  await go("/despesas");
  await shot("17-mobile-despesas");
  await go("/cartoes");
  await shot("18-mobile-cartoes");
  await page.setViewport({ width: 1440, height: 900 });
});

await check("logout, senha incorreta e novo login", async () => {
  await go("/");
  await page.click('button[aria-label="Conta do usuário"]');
  await clickButton("Sair", '[role="menu"]');
  await page.waitForFunction(() => location.pathname === "/login", { timeout: 10000 });
  await type("#email", email);
  await type("#password", "errada123");
  await clickButton("Entrar");
  await waitText("E-mail ou senha incorretos.");
  await type("#password", password);
  await clickButton("Entrar");
  await page.waitForFunction(() => location.pathname === "/", { timeout: 10000 });
  await waitText("R$ 5.870,10");
});

// ---------------------------------------------------------------------------
// Importação de extrato e edição
// ---------------------------------------------------------------------------
const ofxDate = (d) => iso(d).replace(/-/g, "");
const OFX = `OFXHEADER:100
DATA:OFXSGML
CHARSET:1252

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${ofxDate(plus(-1))}<TRNAMT>-45.90<FITID>1<MEMO>Compra no debito - IFOOD *RESTAURANTE</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>${ofxDate(plus(-2))}<TRNAMT>3000.00<FITID>2<MEMO>CREDITO SALARIO EMPRESA XYZ</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${ofxDate(plus(-2))}<TRNAMT>-200.00<FITID>3<MEMO>PIX ENVIADO - JOAO DA SILVA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${ofxDate(plus(-1))}<TRNAMT>-23.40<FITID>4<MEMO>UBER *TRIP</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const CARD_CSV = `date,title,amount\n${iso(plus(-3))},Netflix.com,55.90\n${iso(plus(-2))},Mercadolivre*Loja,129.90\n${iso(plus(-1))},Pagamento recebido,-400.00\n`;
const ofxPath = join(OUT, "extrato-teste.ofx");
const csvPath = join(OUT, "fatura-cartao.csv");
writeFileSync(ofxPath, Buffer.from(OFX, "latin1"));
writeFileSync(csvPath, CARD_CSV);

async function upload(path) {
  const input = await page.waitForSelector('input[aria-label="Arquivo do extrato"]', { timeout: 8000 });
  await input.uploadFile(path);
}

await check("importa extrato OFX com categorias sugeridas", async () => {
  await go("/importar");
  await waitText("Arraste o arquivo aqui");
  await chooseOutside("Destino da importação", "Banco Teste");
  await upload(ofxPath);
  await waitText("4 lançamento(s) encontrados");
  await waitText("Selecionados para importar");
  const cat = (d) => page.$eval(`[aria-label="Categoria de ${d}"]`, (el) => el.textContent.trim());
  assert((await cat("Compra no debito - IFOOD *RESTAURANTE")) === "Alimentação", "ifood");
  assert((await cat("UBER *TRIP")) === "Transporte", "uber");
  assert((await cat("CREDITO SALARIO EMPRESA XYZ")) === "Salário", "salário");
  assert((await cat("PIX ENVIADO - JOAO DA SILVA")) === "Sem categoria", "pix");
  await shot("19-importar-previa");
  await clickButton("Importar 4 lançamento(s)");
  await waitText("4 lançamento(s) importado(s)");
  await waitText("1 ficaram sem categoria");
  await shot("20-importar-concluido", false);
});

await check("reimportar o mesmo extrato não duplica", async () => {
  await clickButton("Importar outro");
  await chooseOutside("Destino da importação", "Banco Teste");
  await upload(ofxPath);
  await waitText("Já existentes (4)");
  await waitText("Já importado");
  const disabled = await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.includes("Importar 0"))?.disabled);
  assert(disabled === true, "botão deveria estar desabilitado");
  await clickButton("Cancelar");
});

await check("importa fatura CSV no cartão (inverte sinais e ignora pagamento)", async () => {
  await go("/importar");
  await chooseOutside("Destino da importação", "Cartão Cartão Teste");
  await upload(csvPath);
  await waitText("3 lançamento(s) encontrados");
  await waitText("Pagamento/estorno");
  const inverted = await page.$eval('[aria-label="Inverter entradas e saídas"]', (el) => el.getAttribute("data-state"));
  assert(inverted === "checked", "deveria inverter automaticamente");
  await waitText("Importar 2 lançamento(s)");
  await clickButton("Importar 2 lançamento(s)");
  await waitText("2 lançamento(s) importado(s)");
  await go("/cartoes");
  await waitText("Netflix.com");
});

await check("categoriza em lote os lançamentos sem categoria", async () => {
  await go("/movimentacoes");
  await waitText("lançamento(s) sem categoria");
  await clickButton("Ver e categorizar");
  await waitText("PIX ENVIADO - JOAO DA SILVA");
  await page.click('[aria-label="Selecionar todos"]');
  await waitText("selecionado(s)");
  await shot("21-lote", false);
  await chooseOutside("Definir categoria dos selecionados", "Moradia");
  await waitText("Nenhum lançamento encontrado");
  await go("/movimentacoes");
  await waitNoText("lançamento(s) sem categoria");
  await type('input[aria-label="Buscar"]', "joao");
  await waitText("Moradia");
});

await check("editar clicando no lançamento (lista e painel)", async () => {
  await go("/movimentacoes");
  await page.evaluate(() => [...document.querySelectorAll("td")].find((td) => td.innerText.includes("UBER *TRIP"))?.click());
  await page.waitForSelector("#tx-desc");
  assert((await page.$eval("#tx-desc", (el) => el.value)) === "UBER *TRIP", "abriu o lançamento errado");
  await type("#tx-desc", "Uber para o trabalho");
  await clickButton("Salvar alterações", inDialog);
  await dialogClosed();
  await waitText("Uber para o trabalho");
  await go("/");
  await page.click('button[aria-label="Editar Uber para o trabalho"]');
  await page.waitForSelector("#tx-desc");
  await page.keyboard.press("Escape");
  await dialogClosed();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await go("/importar");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!overflow, "rolagem horizontal no celular");
  await go("/movimentacoes");
  await shot("22-mobile-movimentacoes");
  await page.setViewport({ width: 1440, height: 900 });
});


await check("outro usuário não vê os dados do primeiro", async () => {
  await page.click('button[aria-label="Conta do usuário"]');
  await clickButton("Sair", '[role="menu"]');
  await page.waitForFunction(() => location.pathname === "/login", { timeout: 10000 });
  await go("/cadastro");
  await type("#name", "Outra Pessoa");
  await type("#email", `outro${Date.now()}@exemplo.com`);
  await type("#password", password);
  await type("#confirm", password);
  await clickButton("Criar conta");
  await page.waitForFunction(() => location.pathname === "/", { timeout: 10000 });
  await waitText("Primeiros passos");
  const text = await bodyText();
  assert(!text.includes("Notebook") && !text.includes("5.879,60"), "dados vazaram entre usuários");
});

await browser.close();
console.log("\n" + results.join("\n"));
if (problems.length) console.log("\nErros no console:\n" + [...new Set(problems)].join("\n"));
const failed = results.filter((r) => r.startsWith("✘")).length;
console.log(`\n${results.length - failed}/${results.length} cenários aprovados`);
process.exit(failed || problems.length ? 1 : 0);
