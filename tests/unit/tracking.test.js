import { describe, expect, it } from 'vitest';
import {
  formatSleep,
  journalSummary,
  parseSleep,
  parseTags,
  setSeverity,
  toggleSymptom,
} from '../../src/lib/health/journal.js';
import {
  allTypes,
  bmi,
  customKey,
  formatReading,
  latestByType,
  outOfTarget,
  parseReading,
  series,
  stats,
} from '../../src/lib/health/measures.js';
import { parseStamp } from '../../src/lib/health/schedule.js';
import {
  dailyUse,
  remainingStock,
  stockStatus,
  suggestedRefill,
} from '../../src/lib/health/stock.js';

const med = (data = {}) => ({
  id: 'm1',
  active: true,
  startDate: '2026-10-01',
  endDate: null,
  schedule: {
    type: 'daily',
    times: [
      { time: '08:00', amount: 1 },
      { time: '20:00', amount: 1 },
    ],
  },
  stockQty: 20,
  stockAt: '2026-10-05T12:00',
  refillAt: null,
  packSize: null,
  ...data,
});
const taken = (takenAt, amount = 1) => ({
  medId: 'm1',
  status: 'taken',
  takenAt,
  date: takenAt.slice(0, 10),
  amount,
});

describe('stock calculé', () => {
  it('restant = saisi + rachats − prises, uniquement après la saisie', () => {
    const logs = [
      taken('2026-10-05T08:00'), // avant la saisie : déjà compté
      taken('2026-10-05T20:00'),
      taken('2026-10-06T08:00', 0.5),
      { ...taken('2026-10-06T20:00'), status: 'skipped' },
    ];
    const refills = [{ medId: 'm1', qty: 30, at: '2026-10-06T10:00' }];
    expect(remainingStock(med(), logs, refills)).toBe(48.5);
  });

  it("annuler une prise (ligne supprimée) remet le stock d'elle-même", () => {
    expect(remainingStock(med(), [taken('2026-10-06T08:00')], [])).toBe(19);
    expect(remainingStock(med(), [], [])).toBe(20);
  });

  it('non suivi : null', () => {
    expect(remainingStock(med({ stockQty: null }), [], [])).toBeNull();
    expect(stockStatus(med({ stockAt: null }), [], [], '2026-10-07')).toBeNull();
  });

  it('jours restants et date de fin selon le planning réel', () => {
    expect(dailyUse(med(), [], '2026-10-07')).toBe(2);
    expect(stockStatus(med(), [], [], '2026-10-07')).toEqual({
      remaining: 20,
      days: 10,
      runsOutOn: '2026-10-17',
      level: 'ok',
    });
  });

  it('alerte au seuil saisi, sinon sous 7 jours ; « épuisé » à zéro', () => {
    expect(stockStatus(med({ refillAt: 20 }), [], [], '2026-10-07').level).toBe('low');
    expect(stockStatus(med({ stockQty: 12 }), [], [], '2026-10-07').level).toBe('low');
    expect(stockStatus(med({ stockQty: 0 }), [], [], '2026-10-07').level).toBe('out');
  });

  it('à la demande : consommation réelle des 14 derniers jours', () => {
    const m = med({ schedule: { type: 'asNeeded', amount: 1 } });
    const logs = Array.from({ length: 7 }, (_, i) => taken(`2026-10-0${i + 1}T09:00`));
    expect(dailyUse(m, logs, '2026-10-07')).toBe(0.5);
    expect(stockStatus(m, [], [], '2026-10-07').days).toBeNull();
  });

  it('quantité proposée au rachat : boîte, sinon dernier rachat', () => {
    expect(suggestedRefill(med({ packSize: 28 }), [])).toBe(28);
    const refills = [
      { medId: 'm1', qty: 30, at: '2026-09-01T10:00' },
      { medId: 'm1', qty: 60, at: '2026-10-01T10:00' },
    ];
    expect(suggestedRefill(med(), refills)).toBe(60);
    expect(suggestedRefill(med(), [])).toBeNull();
  });
});

describe('mesures', () => {
  const rows = [
    {
      key: 'bp',
      label: 'Tension',
      unit: 'mmHg',
      custom: false,
      targets: { sys: { min: null, max: 130 } },
    },
    { key: 'c_hydra_ab12', label: 'Hydratation', unit: 'L', custom: true, targets: {} },
  ];
  const types = allTypes(rows);
  const bp = types.find((t) => t.key === 'bp');
  const weight = types.find((t) => t.key === 'weight');

  it('fusionne types intégrés (avec cibles perso) et personnalisés', () => {
    expect(bp.targets).toEqual({ sys: { min: null, max: 130 } });
    expect(weight.targets).toEqual({});
    expect(types.at(-1)).toMatchObject({ key: 'c_hydra_ab12', units: ['L'], custom: true });
  });

  it("clé de type personnalisé valide pour l'API", () => {
    const key = customKey('Débit (très) élevé !', 'x9');
    expect(key).toBe('c_debit_tres_eleve_x9');
    expect(key).toMatch(/^[a-z][a-z0-9_]{0,29}$/);
  });

  it('lit et met en forme les valeurs', () => {
    expect(parseReading('78,5')).toBe(78.5);
    expect(parseReading('1,234')).toBeNull();
    expect(formatReading(bp, { sys: 125, dia: 82, pulse: 70 })).toBe('125/82 mmHg · 70 bpm');
    expect(formatReading(weight, { value: 78.5 })).toBe('78,5 kg');
  });

  it('signale seulement les champs hors de la plage saisie', () => {
    expect(outOfTarget(bp, { sys: 135, dia: 90 })).toEqual(['sys']);
    expect(outOfTarget(bp, { sys: 120, dia: 90 })).toEqual([]);
  });

  it('séries, statistiques et tendance', () => {
    const measures = [
      { typeKey: 'weight', date: '2026-10-01', at: '2026-10-01T07:00', values: { value: 80 } },
      { typeKey: 'weight', date: '2026-10-04', at: '2026-10-04T07:00', values: { value: 79 } },
      { typeKey: 'weight', date: '2026-10-07', at: '2026-10-07T07:00', values: { value: 78 } },
      { typeKey: 'bp', date: '2026-10-07', at: '2026-10-07T08:00', values: { sys: 120, dia: 80 } },
    ];
    expect(series(measures, 'weight', 'value', '2026-10-02')).toEqual([
      { t: parseStamp('2026-10-04T07:00'), v: 79 },
      { t: parseStamp('2026-10-07T07:00'), v: 78 },
    ]);
    expect(stats(series(measures, 'weight', 'value', '2026-10-01'))).toEqual({
      count: 3,
      avg: 79,
      min: 78,
      max: 80,
      trend: 'down',
    });
    expect(stats([]).trend).toBeNull();
    expect(latestByType(measures).get('weight').values.value).toBe(78);
  });

  it('tendance stable si la variation est minime', () => {
    expect(
      stats([
        { t: 0, v: 100 },
        { t: 1440, v: 101 },
      ]).trend,
    ).toBe('flat');
  });

  it('IMC descriptif', () => {
    expect(bmi(78.5, 178)).toBe(24.8);
    expect(bmi(78.5, null)).toBeNull();
  });
});

describe('journal', () => {
  it('ajoute puis retire un symptôme, intensité réglable', () => {
    let list = toggleSymptom([], ' Fatigue ');
    expect(list).toEqual([{ name: 'Fatigue', severity: 3, note: null }]);
    list = setSeverity(list, 'fatigue', 5);
    expect(list[0].severity).toBe(5);
    expect(toggleSymptom(list, 'FATIGUE')).toEqual([]);
  });

  it('tags sans doublon', () => {
    expect(parseTags('chaleur, stress , Chaleur,,')).toEqual(['chaleur', 'stress']);
  });

  it('sommeil en heures ↔ minutes', () => {
    expect(parseSleep('7,5')).toBe(450);
    expect(parseSleep('')).toBeNull();
    expect(parseSleep('25')).toBeUndefined();
    expect(parseSleep('abc')).toBeUndefined();
    expect(formatSleep(450)).toBe('7,5');
  });

  it('résumé de la journée', () => {
    const entry = { energy: 4, painLevel: 2, symptoms: [{ name: 'Toux' }] };
    expect(journalSummary(entry, { mood: 4 })).toBe(
      '🙂 · Énergie 4/5 · Douleur 2/10 · 1 symptôme(s)',
    );
    expect(journalSummary(null, null)).toBe('');
  });
});
