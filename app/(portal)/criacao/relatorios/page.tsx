export default function CriacaoRelatoriosPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
        Criação / Relatórios
      </div>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">Relatórios</h1>
      <p className="mt-2 text-sm text-slate-500">
        Em breve: top gravadoras, artistas, músicas e tags mais usadas nas programações — visual estilo
        Spotify.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {[
          { t: "Top gravadoras", c: "from-violet-600 to-indigo-800" },
          { t: "Top artistas", c: "from-emerald-600 to-teal-800" },
          { t: "Top músicas", c: "from-orange-500 to-red-700" },
          { t: "Top estilos / tags", c: "from-pink-500 to-purple-800" },
        ].map((card) => (
          <div
            key={card.t}
            className={`rounded-2xl bg-gradient-to-br ${card.c} p-6 text-white shadow-lg opacity-80`}
          >
            <div className="text-lg font-bold">{card.t}</div>
            <div className="mt-2 text-sm text-white/80">Top 10 · em construção</div>
          </div>
        ))}
      </div>
    </div>
  );
}
