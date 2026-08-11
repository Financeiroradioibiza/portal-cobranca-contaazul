type Props = {
  size?: number;
  className?: string;
};

/** Marca «R» gradiente — igual ao favicon novo (app/icon.svg). */
export function RadioIbizaRMark({ size = 56, className = "" }: Props) {
  const fontSize = Math.round(size * 0.62);
  const radius = Math.round(size * 0.22);

  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center bg-[#12121a] font-extrabold leading-none ${className}`}
      style={{ width: size, height: size, borderRadius: radius, fontSize }}
      aria-hidden
    >
      <span
        className="bg-gradient-to-br from-[#ff4d8d] via-[#ffb84d] to-[#4dd0ff] bg-clip-text text-transparent"
        style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}
      >
        R
      </span>
    </div>
  );
}
