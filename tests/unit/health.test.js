import { describe, expect, it } from 'vitest';
import { parseBackup } from '../../src/lib/backup.js';
import {
  cleanText,
  hasEmergencyInfo,
  isValidPhone,
  parseHeight,
  sortContacts,
  splitList,
  telHref,
} from '../../src/lib/health/emergency.js';

describe('téléphones', () => {
  it.each(['+225 07 00 00 00 00', '0700000000', '(01) 23-45.67', '112'])('accepte %s', (p) => {
    expect(isValidPhone(p)).toBe(true);
  });

  it.each(['', '1', 'appelle-moi', '07<script>', '+', '((12', null])('refuse %s', (p) => {
    expect(isValidPhone(p)).toBe(false);
  });

  it('construit un lien tel: avec seulement les chiffres', () => {
    expect(telHref('+225 07 00-00 (00) 00')).toBe('tel:+2250700000000');
    expect(telHref('15')).toBe('tel:15');
    expect(telHref('  ')).toBeNull();
  });
});

describe('listes saisies librement', () => {
  it('découpe par ligne, virgule ou point-virgule, sans doublon ni vide', () => {
    expect(splitList('Pénicilline\nArachides, pénicilline ;; Latex\n')).toEqual([
      'Pénicilline',
      'Arachides',
      'Latex',
    ]);
    expect(splitList(null)).toEqual([]);
  });

  it('nettoie un texte facultatif', () => {
    expect(cleanText('  Asthme ', 60)).toBe('Asthme');
    expect(cleanText('   ', 60)).toBeNull();
    expect(cleanText('abcdef', 3)).toBe('abc');
  });
});

describe('taille', () => {
  it.each([
    ['178', 178],
    [' 50 ', 50],
    ['250', 250],
    ['49', null],
    ['251', null],
    ['1,78', null],
    ['', null],
  ])('%j → %j', (input, expected) => {
    expect(parseHeight(input)).toBe(expected);
  });
});

describe("carte d'urgence", () => {
  it('trie les contacts par ordre puis par nom', () => {
    const sorted = sortContacts([
      { name: 'Zoé', order: 1 },
      { name: 'Awa', order: 1 },
      { name: 'Koffi', order: 0 },
    ]);
    expect(sorted.map((c) => c.name)).toEqual(['Koffi', 'Awa', 'Zoé']);
  });

  it('sait si la carte contient une info utile', () => {
    expect(hasEmergencyInfo(null, [])).toBe(false);
    expect(hasEmergencyInfo({ heightCm: 178 }, [])).toBe(false);
    expect(hasEmergencyInfo({ bloodGroup: 'O+' }, [])).toBe(true);
    expect(hasEmergencyInfo(null, [{ name: 'Awa' }])).toBe(true);
  });
});

describe('export / import des données santé', () => {
  const file = (collections) => JSON.stringify({ app: 'lifehub', version: 1, collections });

  it("accepte le profil santé (id 'me') et les contacts", () => {
    const parsed = parseBackup(
      file({
        healthProfile: [{ id: 'me', bloodGroup: 'O+' }],
        emergencyContact: [
          {
            id: '6f1c2b1e-4d3a-4b2c-9e8f-0a1b2c3d4e5f',
            name: 'Awa',
            phone: '0102030405',
            order: 0,
          },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.counts).toEqual({ healthProfile: 1, emergencyContact: 1 });
  });

  it("refuse un profil santé avec un autre id que 'me'", () => {
    const parsed = parseBackup(file({ healthProfile: [{ id: 'autre', bloodGroup: 'O+' }] }));
    expect(parsed.ok).toBe(false);
  });
});
