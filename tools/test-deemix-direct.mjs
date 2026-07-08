/**
 * Teste ponta-a-ponta: resolve URL Deezer + download MP3 local via deemix-js (sem ler disco remoto).
 * Uso (cloud2 API container ou local com ARL):
 *   CRIACAO_DEEMIX_ARL=... node tools/test-deemix-direct.mjs [trackUrl]
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const TRACK_URL =
  process.argv[2] ?? "https://www.deezer.com/track/3786825672"; // Wanda Sá - You Are Everything (Bossa)
const ARL = (process.env.CRIACAO_DEEMIX_ARL ?? "").replace(/\s+/g, "");
const BITRATE = Number(process.env.CRIACAO_DEEMIX_BITRATE ?? "3") || 3;
const MIN_BYTES = 12_288;

if (!ARL) {
  console.error("CRIACAO_DEEMIX_ARL não definido");
  process.exit(1);
}

const { Deezer } = require("deezer-js");
const deemix = require("deemix");
const { Downloader } = deemix.downloader;
const { generateDownloadObject } = deemix;
const { DEFAULTS } = deemix.settings;

async function main() {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "deemix-test-"));
  console.log("outDir:", outDir);
  console.log("track:", TRACK_URL);

  const dz = new Deezer();
  const logged = await dz.login_via_arl(ARL);
  if (!logged) {
    console.error("FAIL login_via_arl");
    process.exit(2);
  }
  console.log("OK login ARL user:", dz.current_user?.USER?.USER_ID ?? "?");

  const settings = {
    ...DEFAULTS,
    downloadLocation: outDir,
    maxBitrate: String(BITRATE),
    overwriteFile: "y",
    createArtistFolder: false,
    createAlbumFolder: false,
    createPlaylistFolder: false,
    createSingleFolder: true,
    saveArtwork: false,
    queueConcurrency: 1,
  };

  const downloadObject = await generateDownloadObject(dz, TRACK_URL, BITRATE);
  downloadObject.uuid = `test_${Date.now()}`;

  const listener = {
    send(event, payload) {
      if (event === "downloadInfo" || event === "downloadWarn") {
        console.log(`[${event}]`, payload?.data?.title ?? payload?.state ?? "");
      }
      if (event === "finishDownload") console.log("finishDownload", payload);
    },
  };

  const dl = new Downloader(dz, downloadObject, settings, listener);
  await dl.start();

  const files = await fs.readdir(outDir);
  const mp3s = [];
  async function walk(dir) {
    for (const name of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, name.name);
      if (name.isDirectory()) await walk(p);
      else if (/\.mp3$/i.test(name.name)) mp3s.push(p);
    }
  }
  await walk(outDir);

  if (mp3s.length === 0) {
    console.error("FAIL nenhum MP3 em", outDir, "files:", files);
    process.exit(3);
  }

  for (const f of mp3s) {
    const st = await fs.stat(f);
    const buf = Buffer.alloc(3);
    const fh = await fs.open(f, "r");
    await fh.read(buf, 0, 3, 0);
    await fh.close();
    const id3 = buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33;
    console.log("FILE:", f);
    console.log("SIZE:", st.size, id3 ? "ID3 OK" : "no ID3 header");
    if (st.size < MIN_BYTES) {
      console.error("FAIL arquivo pequeno demais");
      process.exit(4);
    }
  }

  console.log("SUCCESS direct deemix download works");
}

main().catch((e) => {
  console.error("FAIL", e?.message ?? e);
  process.exit(99);
});
