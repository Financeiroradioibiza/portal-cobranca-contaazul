import { UPLOAD_MAX_FILES_PER_JOB } from "@/lib/criacao/uploadLimits";

export function chunkUploadFiles<T>(files: T[], maxPerJob = UPLOAD_MAX_FILES_PER_JOB): T[][] {
  if (files.length === 0) return [];
  if (maxPerJob <= 0) return [files];
  const chunks: T[][] = [];
  for (let i = 0; i < files.length; i += maxPerJob) {
    chunks.push(files.slice(i, i + maxPerJob));
  }
  return chunks;
}

export function uploadPartLabel(partIndex: number, partTotal: number): string | undefined {
  if (partTotal <= 1) return undefined;
  return `parte ${partIndex + 1}/${partTotal}`;
}
