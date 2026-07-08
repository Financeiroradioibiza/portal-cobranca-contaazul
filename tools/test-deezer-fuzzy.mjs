import { artistSimilarity, resolveDeezerTrackFromText } from "../lib/criacao/deezerTrackMatch.ts";

console.log("Sabib/Sarbib:", artistSimilarity("Andre Sabib", "Andre Sarbib").toFixed(3));
console.log("Sabib/Bublé:", artistSimilarity("Andre Sabib", "Michael Bublé").toFixed(3));
console.log("Sabib/Billy Paul:", artistSimilarity("Andre Sabib", "Billy Paul").toFixed(3));

const line = "Andre Sabib - Me and Mrs Jones~3.mp3";
const r = await resolveDeezerTrackFromText(line);
console.log("\nResolve:", line);
console.log("status:", r.status);
const list = r.status === "resolved" ? [r.candidate] : r.candidates;
for (const c of list.slice(0, 6)) {
  console.log(`  ${c.score}%  ${c.artist} — ${c.title}`);
}
