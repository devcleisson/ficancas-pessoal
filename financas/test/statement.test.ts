import { describe, it, expect } from "vitest";
import {
  buildHistory, decodeFile, detectCsvLayout, findDuplicates, guessMethod, merchantKey, parseAnyDate, parseDelimited,
  parseStatement, parseStatementAmount, suggestCategory, type ParsedStatement,
} from "@/lib/statement";
import type { Category } from "@/lib/types";

const ok = (r: ParsedStatement | { error: string }) => {
  if ("error" in r) throw new Error(r.error);
  return r;
};

const cats: Pick<Category, "id" | "name" | "kind">[] = [
  { id: "ali", name: "Alimentação", kind: "expense" },
  { id: "tra", name: "Transporte", kind: "expense" },
  { id: "ass", name: "Assinaturas", kind: "expense" },
  { id: "com", name: "Compras", kind: "expense" },
  { id: "mor", name: "Moradia", kind: "expense" },
  { id: "car", name: "Cartão de crédito", kind: "expense" },
  { id: "sal", name: "Salário", kind: "income" },
  { id: "inv", name: "Investimentos", kind: "income" },
];

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKTRANLIST>
<DTSTART>20261101000000[-3:BRT]
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261103000000[-3:BRT]
<TRNAMT>-45.90
<FITID>abc1
<MEMO>Compra no débito - IFOOD *RESTAURANTE
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261105120000[-3:BRT]
<TRNAMT>5000,00
<FITID>abc2
<NAME>EMPRESA XYZ LTDA
<MEMO>SALARIO
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261106
<TRNAMT>-1.250,00
<FITID>abc3
<MEMO>PIX ENVIADO - JOAO DA SILVA &amp; CIA
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

describe("datas e valores de extrato", () => {
  it("lê datas em vários formatos", () => {
    expect(parseAnyDate("05/11/2026")).toBe("2026-11-05");
    expect(parseAnyDate("5/11/26")).toBe("2026-11-05");
    expect(parseAnyDate("2026-11-05")).toBe("2026-11-05");
    expect(parseAnyDate("20261105120000[-3:BRT]")).toBe("2026-11-05");
    expect(parseAnyDate("31/02/2026")).toBeNull();
    expect(parseAnyDate("Saldo")).toBeNull();
  });
  it("lê valores com sinal, R$, D/C e parênteses", () => {
    expect(parseStatementAmount("-1.234,56")).toBe(-1234.56);
    expect(parseStatementAmount("R$ -10,00")).toBe(-10);
    expect(parseStatementAmount("-R$ 10,00")).toBe(-10);
    expect(parseStatementAmount("12.50")).toBe(12.5);
    expect(parseStatementAmount("50,00 D")).toBe(-50);
    expect(parseStatementAmount("50,00 C")).toBe(50);
    expect(parseStatementAmount("(12,00)")).toBe(-12);
    expect(parseStatementAmount("+300,00")).toBe(300);
    expect(parseStatementAmount("abc")).toBeNull();
  });
});

describe("OFX", () => {
  it("lê lançamentos de OFX SGML (vírgula ou ponto decimal, entidades)", () => {
    const r = ok(parseStatement(OFX_SGML, "extrato.ofx"));
    expect(r.format).toBe("ofx");
    expect(r.accountType).toBe("bank");
    expect(r.rows.map((x) => [x.date, x.amount])).toEqual([["2026-11-03", -45.9], ["2026-11-05", 5000], ["2026-11-06", -1250]]);
    expect(r.rows[1].description).toBe("EMPRESA XYZ LTDA - SALARIO");
    expect(r.rows[2].description).toBe("PIX ENVIADO - JOAO DA SILVA & CIA");
  });
  it("lê OFX em XML e de cartão de crédito", () => {
    const xml = `<?xml version="1.0"?><OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST>
      <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261110</DTPOSTED><TRNAMT>-99.90</TRNAMT><MEMO>NETFLIX.COM</MEMO></STMTTRN>
      </BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;
    const r = ok(parseStatement(xml));
    expect(r.accountType).toBe("creditcard");
    expect(r.rows).toEqual([{ index: 0, date: "2026-11-10", description: "NETFLIX.COM", amount: -99.9 }]);
  });
  it("decodifica arquivos em Windows-1252", () => {
    const bytes = new Uint8Array([0x44, 0xe9, 0x62, 0x69, 0x74, 0x6f]); // "Débito" em latin1
    expect(decodeFile(bytes.buffer)).toBe("Débito");
    expect(decodeFile(new TextEncoder().encode("﻿Débito").buffer as ArrayBuffer)).toBe("Débito");
  });
});

describe("CSV de bancos", () => {
  it("CSV com vírgula e ponto decimal (estilo conta digital)", () => {
    const csv = "Data,Valor,Identificador,Descrição\n03/11/2026,-45.90,id1,Compra no débito - Ifood\n05/11/2026,5000.00,id2,Transferência recebida - Empresa XYZ\n";
    const r = ok(parseStatement(csv));
    expect(r.rows.map((x) => [x.date, x.amount, x.description])).toEqual([
      ["2026-11-03", -45.9, "Compra no débito - Ifood"],
      ["2026-11-05", 5000, "Transferência recebida - Empresa XYZ"],
    ]);
  });
  it("cabeçalho depois de linhas de título, com coluna de saldo e linha de saldo", () => {
    const csv = [
      "Extrato Conta Corrente",
      "Conta;12345-6",
      "",
      "Data Lançamento;Histórico;Descrição;Valor;Saldo",
      "01/11/2026;Saldo Anterior;;;1.000,00",
      "03/11/2026;Pix enviado;Mercado Bom Preço;-120,50;879,50",
      "04/11/2026;Pix recebido;Maria;200,00;1.079,50",
    ].join("\n");
    const r = ok(parseStatement(csv));
    expect(r.csv?.headerRow).toBe(2); // linhas vazias são descartadas
    expect(r.rows.map((x) => [x.amount, x.description])).toEqual([[-120.5, "Pix enviado - Mercado Bom Preço"], [200, "Pix recebido - Maria"]]);
  });
  it("colunas separadas de crédito e débito", () => {
    const csv = "Data;Descrição;Crédito;Débito\n02/11/2026;Salário;3.000,00;\n03/11/2026;Aluguel;;1.500,00\n";
    const r = ok(parseStatement(csv));
    expect(r.rows.map((x) => x.amount)).toEqual([3000, -1500]);
  });
  it("coluna de tipo e categoria (CSV exportado pelo próprio sistema)", () => {
    const csv = "﻿Data;Tipo;Descrição;Valor;Categoria\n05/11/2026;Receita;Salário;5.000,00;Salário\n06/11/2026;Despesa;Mercado;45,90;Alimentação\n";
    const r = ok(parseStatement(csv));
    expect(r.rows.map((x) => [x.amount, x.categoryName])).toEqual([[5000, "Salário"], [-45.9, "Alimentação"]]);
  });
  it("sem cabeçalho: deduz colunas pelos dados", () => {
    const rows = parseDelimited("03/11/2026;UBER TRIP;-23,40;500,00\n04/11/2026;POSTO SHELL;-150,00;350,00\n05/11/2026;PIX RECEBIDO;100,00;450,00\n");
    const layout = detectCsvLayout(rows)!;
    expect([layout.date, layout.description, layout.amount]).toEqual([0, 1, 2]);
  });
  it("arquivo sem dados válidos devolve erro", () => {
    expect(parseStatement("nome;idade\njoao;30")).toHaveProperty("error");
  });
});

describe("categorias sugeridas", () => {
  it("reconhece estabelecimentos comuns", () => {
    const s = (d: string, k: "income" | "expense" = "expense") => suggestCategory({ description: d }, k, cats, new Map()).categoryId;
    expect(s("Compra no débito - IFOOD *RESTAURANTE")).toBe("ali");
    expect(s("UBER *TRIP HELP.UBER.COM")).toBe("tra");
    expect(s("NETFLIX.COM")).toBe("ass");
    expect(s("MERCADOLIVRE*VENDEDOR")).toBe("com");
    expect(s("Pagamento de fatura")).toBe("car");
    expect(s("CREDITO SALARIO EMPRESA", "income")).toBe("sal");
    expect(s("RENDIMENTO POUPANCA", "income")).toBe("inv");
    expect(s("PIX ENVIADO - JOAO")).toBeNull();
  });
  it("aprende com o histórico do usuário", () => {
    const history = buildHistory([
      { description: "PIX ENVIADO - JOAO DA SILVA", category_id: "mor", kind: "expense" },
      { description: "Pix enviado João da Silva 123", category_id: "mor", kind: "expense" },
    ]);
    expect(merchantKey("PIX ENVIADO - JOAO DA SILVA")).toBe("joao da silva");
    expect(suggestCategory({ description: "Pix enviado - Joao da Silva" }, "expense", cats, history)).toEqual({ categoryId: "mor", source: "history" });
  });
  it("categoria do arquivo tem prioridade", () => {
    expect(suggestCategory({ description: "Uber", categoryName: "alimentacao" }, "expense", cats, new Map())).toEqual({ categoryId: "ali", source: "file" });
  });
  it("adivinha a forma de pagamento", () => {
    expect(guessMethod("PIX ENVIADO", "expense")).toBe("pix");
    expect(guessMethod("Pagamento de boleto", "expense")).toBe("boleto");
    expect(guessMethod("Compra no débito", "expense")).toBe("debit");
    expect(guessMethod("TED recebida", "income")).toBe("transfer");
  });
});

describe("duplicados", () => {
  const existing = [
    { date: "2026-11-03", amount: 45.9, kind: "expense" as const, description: "Compra no débito - IFOOD" },
    { date: "2026-11-05", amount: 120, kind: "expense" as const, description: "Mercado (lançado à mão)" },
  ];
  it("marca reimportação como duplicado e lançamento manual como possível duplicado", () => {
    const rows = [
      { date: "2026-11-03", amount: -45.9, description: "compra no debito - ifood" },
      { date: "2026-11-03", amount: -45.9, description: "Compra no débito - IFOOD" }, // segunda compra igual no mesmo dia
      { date: "2026-11-04", amount: -120, description: "MERCADO BOM PRECO" },
      { date: "2026-11-04", amount: 120, description: "PIX RECEBIDO" },
    ];
    expect(findDuplicates(rows, existing)).toEqual(["duplicate", "new", "possible", "new"]);
  });
});
