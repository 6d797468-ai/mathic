/**
 * K7-MOMO — Coach : modèle Supra-50M (BASE) + garde-fou anti-charabia.
 *
 * Vérifie :
 *  - le prompt est adapté à un modèle BASE (continuation naturelle, amorce
 *    « Momo : ») et non au ChatML d'un modèle instruct ;
 *  - sanitizeOutput accepte les répliques saines (courtes, math OK) et
 *    REJETTE tout ce qui n'est pas une phrase exploitable (vide, contrôle,
 *    répétition pathologique, texte trop long, bruit binaire) → la chaîne
 *    de secours (banque de répliques) prend le relais dans ai.js.
 *
 * Gate : K7
 */

import { buildPrompt, sanitizeOutput } from '../src/ai-text.js';

let failures = 0;
const check = (name, ok) => {
  if (!ok) { failures++; console.error('FAIL', name); }
  else console.log('  ok ', name);
};

console.log('— K7-MOMO : prompt modèle BASE (pas de ChatML) —');
{
  const p = buildPrompt('Quel conseil donnerais-tu ?');
  check('le prompt porte la consigne', p.startsWith('Quel conseil donnerais-tu ?'));
  check('pas de balise ChatML (modèle BASE)', !p.includes('<|im_start|>') && !p.includes('<|im_end|>'));
  check('amorce de continuation « Momo : » en fin', /Momo :$/.test(p));
}

console.log('— K7-MOMO : répliques SAINES acceptées —');
{
  const good = [
    'Bravo, la fusion 3+3 donne 6, exactement la cible visée !',
    '3 + 3 = 6, super !',
    'Nettoyage impeccable, le plateau respire.',
    'Tu pourrais rapprocher ce 12 et ce 3.',
  ];
  for (const s of good) check(`accepte : « ${s.slice(0, 28)}… »`, sanitizeOutput(s) !== '');
  check('retire les balises ChatML résiduelles', sanitizeOutput('<|im_end|>Bien joué !') === 'Bien joué !');
  check('retire l’amorce « Momo : »', sanitizeOutput('Momo : Repose-toi') === 'Repose-toi');
}

console.log('— K7-MOMO : charabia REJETÉ (→ banque de secours) —');
{
  const bad = [
    '',
    '   ',
    'x',
    '\u0000\u0001\u0002',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'é&é&é&é&é&é&é&é&é&',
    '!!',
  ];
  for (const s of bad) check(`rejette : ${JSON.stringify(s.slice(0, 20))}`, sanitizeOutput(s) === '');
  const ramble = 'donc je pense que si on considère toutes les implications ' +
    'possibles du plateau sous la perspective de la fusion et puis après on ' +
    'peut voir que le joueur a fait un excellent choix parce qu’il y a beaucoup ' +
    'de possibilités et puis on pourrait aussi réfléchir à la stratégie globale ' +
    'long terme mais en fait le plus important c’est que chaque coup compte et ' +
    'que la persévérance mène toujours au succès final dans ce genre de jeu de ' +
    'logique mathématique passionnant et même si parfois on perd il faut se dire ' +
    'que l’important c’est de participer et de progresser à son rythme';
  check('rejette le radotage long (> 260)', sanitizeOutput(ramble) === '');
}

console.log('— K7-MOMO : troncature propre à 140 —');
{
  const long = 'Vraiment magnifique ce coup, tu as su libérer l’espace au bon moment ' +
    'et tes fusions enchaînées prouvent que tu as l’instinct du jeu, continue comme ça !';
  const out = sanitizeOutput(long);
  check('tronqué à ≤ 140 et terminé par « … »', out.length > 0 && out.length <= 140 && out.endsWith('…'));
}

if (failures > 0) {
  console.error(`\n❌ ${failures} échec(s) K7`);
  process.exit(1);
} else {
  console.log('\n✅ K7 Momo — tous les tests passent');
}