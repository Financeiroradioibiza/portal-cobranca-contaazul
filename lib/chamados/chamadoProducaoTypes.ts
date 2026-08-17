export type ChamadoProducaoPdvOpcao = {
  rioPdvKey: string;
  nome: string;
};

export type ChamadoProducaoClienteOpcao = {
  key: string;
  nome: string;
  rioLinhaId: string;
  pdvs: ChamadoProducaoPdvOpcao[];
};

export function tituloChamadoParaCliente(nome: string): string {
  return nome.trim().slice(0, 200);
}

export function tituloChamadoParaPdv(pdvNome: string, clienteNome: string): string {
  const pdv = pdvNome.trim();
  const cli = clienteNome.trim();
  if (!pdv) return cli.slice(0, 200);
  if (!cli || pdv.toLowerCase() === cli.toLowerCase()) return pdv.slice(0, 200);
  return `${pdv} — ${cli}`.slice(0, 200);
}
