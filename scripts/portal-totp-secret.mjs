#!/usr/bin/env node
/**
 * Gera segredo TOTP (Google Authenticator) para PORTAL_USERS_JSON.
 *
 *   npm run portal:totp-secret
 *   npm run portal:totp-secret -- "Rafael Gasparian"
 */
import { generateSecret, generateURI } from "otplib";

const label = process.argv.slice(2).join(" ").trim() || "Portal Radio Ibiza";
const secret = generateSecret();
const issuer = "Radio Ibiza Portal";
const otpauth = generateURI({ issuer, label, secret });

console.log("");
console.log("Segredo Base32 (cole em totpSecret no PORTAL_USERS_JSON):");
console.log(secret);
console.log("");
console.log("No Google Authenticator: + → Inserir chave de configuração");
console.log(`Conta: ${label}`);
console.log(`Emissor: ${issuer}`);
console.log("");
console.log("URL otpauth (para QR offline, se quiser):");
console.log(otpauth);
console.log("");
