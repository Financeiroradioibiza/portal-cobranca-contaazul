import {
  RIO_TAG_COBRANCA_OPTS,
  rioTagCobrancaSuffix,
  rioTagCobrancaTextClass,
  type RioTagCobranca,
} from "@/lib/rio/rioTagCobranca";

export function RioTagCobrancaNome({
  nome,
  tag,
  className = "",
  suffixClassName = "text-[10px] font-bold",
}: {
  nome: string;
  tag?: RioTagCobranca | null;
  className?: string;
  suffixClassName?: string;
}) {
  const normalized = tag ?? "cobrando";
  const suffix = rioTagCobrancaSuffix(normalized);
  const tone = rioTagCobrancaTextClass(normalized);
  return (
    <span className={className}>
      <span className={tone || undefined}>{nome}</span>
      {suffix ?
        <span className={"ml-1 " + suffixClassName + (tone ? " " + tone : "")}>{suffix}</span>
      : null}
    </span>
  );
}

export function RioTagCobrancaSelect({
  value,
  onChange,
  disabled,
  className = "",
}: {
  value: RioTagCobranca;
  onChange: (next: RioTagCobranca) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <select
      className={
        "rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold dark:border-slate-600 dark:bg-slate-900 " +
        rioTagCobrancaTextClass(value) +
        " " +
        className
      }
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as RioTagCobranca)}
    >
      {RIO_TAG_COBRANCA_OPTS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
