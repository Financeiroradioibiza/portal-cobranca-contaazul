import fs from "node:fs";
import { parsePlanilhaProdWorkbook } from "../lib/criacao/planilhaProdImport";
import { importPlanilhaProdMonths } from "../lib/criacao/planilhaProdService";

async function main() {
  const xlsxPath = process.argv[2];
  if (!xlsxPath || !fs.existsSync(xlsxPath)) {
    console.error("Uso: node .seed-planilha-prod.run.cjs /caminho/planilha.xlsx");
    process.exit(1);
  }
  const buffer = fs.readFileSync(xlsxPath);
  const months = await parsePlanilhaProdWorkbook(buffer);
  console.log(`Abas válidas: ${months.length}`);
  const stats = await importPlanilhaProdMonths(months);
  console.log(`Importado: ${stats.months} mês(es), ${stats.rows} linha(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
