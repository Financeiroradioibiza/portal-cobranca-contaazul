#!/usr/bin/env node
import webpush from "web-push";

const keys = webpush.generateVAPIDKeys();
console.log("Adicione ao Netlify / .env.local:\n");
console.log(`PUSH_VAPID_PUBLIC_KEY="${keys.publicKey}"`);
console.log(`PUSH_VAPID_PRIVATE_KEY="${keys.privateKey}"`);
console.log('PUSH_VAPID_SUBJECT="mailto:chamados@radioibiza.com.br"');
