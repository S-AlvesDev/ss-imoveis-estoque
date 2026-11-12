// Confirma as stanzas <status> que a Baileys 7.0.0-rc.9 ignora.
//
// Desde o fim de setembro o WhatsApp envia stanzas <status> de nível raiz.
// A Baileys não as confirma; cerca de 50 min depois o servidor derruba o
// stream, e na reconexão a mesma stanza volta sem confirmação — a fila de
// mensagens trava e a instância fica conectada e surda.
//
// Origem: github.com/evolution-foundation/evolution-api/issues/2778
// Não é correção oficial: a PR #2785 está parada aguardando revisão.

const fs = require('fs');

const base = process.argv[2] || '/evolution/node_modules/baileys';
const ESPERADA = '7.0.0-rc.9';

const pkg = JSON.parse(fs.readFileSync(base + '/package.json', 'utf8'));
if (pkg.version !== ESPERADA) {
  console.error(`Baileys ${pkg.version} — este remendo é só para ${ESPERADA}. Nada foi feito.`);
  process.exit(1);
}

const alvo = base + '/lib/Socket/messages-recv.js';
let src = fs.readFileSync(alvo, 'utf8');

if (src.includes('CB:status')) {
  console.log('Já estava aplicado. Nada foi feito.');
  process.exit(0);
}

const ancora = ["ws.on('CB:notification'", 'ws.on("CB:notification"'].find((a) => src.includes(a));
if (!ancora) {
  console.error('Âncora CB:notification não encontrada — o arquivo mudou. Nada foi feito.');
  process.exit(1);
}

fs.copyFileSync(alvo, alvo + '.antes-do-remendo');

const i = src.indexOf(ancora);
const handler =
  "ws.on('CB:status', (node) => { sendMessageAck(node).catch((e) => onUnexpectedError(e, 'acking status stanza')); });\n    ";
src = src.slice(0, i) + handler + src.slice(i);
fs.writeFileSync(alvo, src);

console.log('Aplicado. Cópia do original em ' + alvo + '.antes-do-remendo');
