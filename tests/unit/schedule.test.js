import { describe, expect, it } from 'vitest';
import { dayPart, formatAmount, parseAmount, scheduleLabel } from '../../src/lib/health/meds.js';
import { alertText, doseAlerts } from '../../src/lib/health/reminders.js';
import {
  cureEnded,
  cureSummary,
  dayIndex,
  doseKey,
  doseWarnings,
  dosesForDay,
  formatStamp,
  isoWeekday,
  missedDoses,
  nextDose,
  nowStamp,
  occurrencesBetween,
  parseStamp,
  statusFor,
} from '../../src/lib/health/schedule.js';

const at = (stamp) => parseStamp(stamp);
const med = (schedule, data = {}) => ({
  id: 'm1',
  name: 'Med',
  active: true,
  startDate: '2026-10-01',
  endDate: null,
  schedule,
  ...data,
});
const slots = (list) => list.map((o) => `${o.date} ${o.time}`);
const one = [{ time: '08:00', amount: 1 }];

describe('heures murales', () => {
  it('indexe les jours sans fuseau', () => {
    expect(dayIndex('1970-01-02')).toBe(1);
    expect(isoWeekday(dayIndex('2026-10-05'))).toBe(1); // lundi
    expect(isoWeekday(dayIndex('2026-10-11'))).toBe(7); // dimanche
  });

  it('aller-retour minutes ↔ horodatage', () => {
    expect(formatStamp(at('2026-10-07T08:05'))).toBe('2026-10-07T08:05');
    expect(at('2026-10-08T00:00') - at('2026-10-07T23:00')).toBe(60);
  });

  it("lit l'heure affichée par l'appareil, quel que soit son fuseau", () => {
    expect(nowStamp(new Date(2026, 9, 25, 2, 30))).toBe('2026-10-25T02:30');
  });
});

describe('occurrencesBetween', () => {
  it('tous les jours, plusieurs horaires triés, bornés par début et fin', () => {
    const m = med(
      {
        type: 'daily',
        times: [
          { time: '20:00', amount: 0.5 },
          { time: '08:00', amount: 1 },
        ],
      },
      { endDate: '2026-10-02' },
    );
    expect(slots(occurrencesBetween(m, '2026-09-28', '2026-10-05'))).toEqual([
      '2026-10-01 08:00',
      '2026-10-01 20:00',
      '2026-10-02 08:00',
      '2026-10-02 20:00',
    ]);
    expect(occurrencesBetween(m, '2026-10-01', '2026-10-01')[1]).toEqual({
      key: doseKey('m1', '2026-10-01', '20:00'),
      medId: 'm1',
      date: '2026-10-01',
      time: '20:00',
      amount: 0.5,
    });
  });

  it('jours de la semaine (lundi = 1)', () => {
    const m = med({ type: 'weekdays', times: one, weekdays: [1, 3, 5] });
    expect(slots(occurrencesBetween(m, '2026-10-05', '2026-10-11'))).toEqual([
      '2026-10-05 08:00',
      '2026-10-07 08:00',
      '2026-10-09 08:00',
    ]);
  });

  it('tous les N jours, à partir du début', () => {
    const m = med({ type: 'everyNDays', times: one, interval: 3 });
    expect(slots(occurrencesBetween(m, '2026-10-02', '2026-10-10'))).toEqual([
      '2026-10-04 08:00',
      '2026-10-07 08:00',
      '2026-10-10 08:00',
    ]);
  });

  it('toutes les N heures, à cheval sur minuit', () => {
    const m = med({ type: 'everyNHours', times: [{ time: '22:00', amount: 1 }], interval: 8 });
    expect(slots(occurrencesBetween(m, '2026-10-01', '2026-10-02'))).toEqual([
      '2026-10-01 22:00',
      '2026-10-02 06:00',
      '2026-10-02 14:00',
      '2026-10-02 22:00',
    ]);
  });

  it('toutes les 5 h : le rythme se décale de jour en jour', () => {
    const m = med({ type: 'everyNHours', times: [{ time: '08:00', amount: 1 }], interval: 5 });
    expect(slots(occurrencesBetween(m, '2026-10-02', '2026-10-02'))).toEqual([
      '2026-10-02 04:00',
      '2026-10-02 09:00',
      '2026-10-02 14:00',
      '2026-10-02 19:00',
    ]);
  });

  it("garde les heures murales le jour du changement d'heure", () => {
    const m = med(
      { type: 'everyNHours', times: [{ time: '06:00', amount: 1 }], interval: 8 },
      { startDate: '2026-03-28' },
    );
    expect(slots(occurrencesBetween(m, '2026-03-29', '2026-03-29'))).toEqual([
      '2026-03-29 06:00',
      '2026-03-29 14:00',
      '2026-03-29 22:00',
    ]);
  });

  it('cure : X jours de prise, Y jours de pause', () => {
    const m = med({ type: 'cycle', times: one, cycle: { on: 2, off: 1 } });
    const days = occurrencesBetween(m, '2026-10-01', '2026-10-07').map((o) => o.date.slice(8));
    expect(days).toEqual(['01', '02', '04', '05', '07']);
  });

  it('mensuel : le 31 devient le dernier jour des mois courts', () => {
    const m = med({ type: 'monthly', times: one, monthDay: 31 }, { startDate: '2026-01-01' });
    const dates = occurrencesBetween(m, '2026-01-01', '2026-04-30').map((o) => o.date);
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('à la demande : aucune prise planifiée', () => {
    const m = med({ type: 'asNeeded', amount: 1 });
    expect(occurrencesBetween(m, '2026-10-01', '2026-10-31')).toEqual([]);
  });
});

describe('statusFor', () => {
  const occ = { date: '2026-10-07', time: '08:00' };

  it('à venir, à prendre pendant 2 h, puis manquée', () => {
    expect(statusFor(occ, null, at('2026-10-07T07:59'))).toBe('upcoming');
    expect(statusFor(occ, null, at('2026-10-07T08:00'))).toBe('due');
    expect(statusFor(occ, null, at('2026-10-07T10:00'))).toBe('due');
    expect(statusFor(occ, null, at('2026-10-07T10:01'))).toBe('missed');
  });

  it("une action de l'utilisateur prime", () => {
    const now = at('2026-10-08T12:00');
    expect(statusFor(occ, { status: 'taken' }, now)).toBe('taken');
    expect(statusFor(occ, { status: 'skipped' }, now)).toBe('skipped');
  });

  it('report : en cours, puis à prendre, puis manquée à partir de sa fin', () => {
    const log = { status: 'snoozed', snoozeUntil: '2026-10-07T09:00' };
    expect(statusFor(occ, log, at('2026-10-07T08:30'))).toBe('snoozed');
    expect(statusFor(occ, log, at('2026-10-07T10:30'))).toBe('due');
    expect(statusFor(occ, log, at('2026-10-07T11:01'))).toBe('missed');
  });
});

describe('prises du jour et rattrapage', () => {
  const daily = med({
    type: 'daily',
    times: [
      { time: '08:00', amount: 1 },
      { time: '20:00', amount: 1 },
    ],
  });
  const archived = med({ type: 'daily', times: one }, { id: 'm2', active: false });
  const taken = {
    medId: 'm1',
    date: '2026-10-07',
    time: '08:00',
    status: 'taken',
    takenAt: '2026-10-07T08:10',
    scheduled: true,
  };

  it('liste les prises du jour des traitements actifs, avec leur statut', () => {
    const doses = dosesForDay([daily, archived], [taken], '2026-10-07', at('2026-10-07T12:00'));
    expect(doses.map((d) => `${d.occurrence.time} ${d.status}`)).toEqual([
      '08:00 taken',
      '20:00 upcoming',
    ]);
    expect(nextDose(doses).occurrence.time).toBe('20:00');
  });

  it("rattrapage : prises manquées depuis hier, sans celles qu'on a faites", () => {
    const missed = missedDoses([daily], [taken], at('2026-10-07T23:00'));
    // À 23 h, la prise de 20 h du jour a dépassé son délai de 2 h.
    expect(missed.map((d) => d.occurrence.key)).toEqual([
      doseKey('m1', '2026-10-06', '08:00'),
      doseKey('m1', '2026-10-06', '20:00'),
      doseKey('m1', '2026-10-07', '20:00'),
    ]);
  });
});

describe("avertissements (limites fixées par l'utilisateur)", () => {
  const asNeeded = med({ type: 'asNeeded', amount: 1, maxPer24h: 3, minGapMin: 240 });
  const log = (takenAt) => ({ medId: 'm1', status: 'taken', takenAt, scheduled: false });

  it('max sur 24 h glissantes', () => {
    const logs = [log('2026-10-06T10:00'), log('2026-10-06T16:00'), log('2026-10-07T06:00')];
    expect(doseWarnings(asNeeded, logs, at('2026-10-07T09:59')).overMax).toBe(true);
    expect(doseWarnings(asNeeded, logs, at('2026-10-07T10:00')).overMax).toBe(false);
  });

  it('écart minimal depuis la dernière prise', () => {
    const logs = [log('2026-10-07T06:00')];
    expect(doseWarnings(asNeeded, logs, at('2026-10-07T09:00'))).toMatchObject({
      tooSoon: true,
      sinceLast: 180,
    });
    expect(doseWarnings(asNeeded, logs, at('2026-10-07T10:00')).tooSoon).toBe(false);
  });

  it('sans limite saisie, aucun avertissement', () => {
    const free = med({ type: 'daily', times: one });
    expect(doseWarnings(free, [log('2026-10-07T07:59')], at('2026-10-07T08:00'))).toMatchObject({
      overMax: false,
      tooSoon: false,
    });
  });
});

describe('cure temporaire', () => {
  const cure = med({ type: 'daily', times: one }, { endDate: '2026-10-07' });

  it('se termine après sa date de fin', () => {
    expect(cureEnded(cure, '2026-10-07')).toBe(false);
    expect(cureEnded(cure, '2026-10-08')).toBe(true);
    expect(cureEnded(med({ type: 'daily', times: one }), '2030-01-01')).toBe(false);
  });

  it('bilan : prévues vs prises', () => {
    const logs = [
      { medId: 'm1', status: 'taken' },
      { medId: 'm1', status: 'skipped' },
    ];
    expect(cureSummary(cure, logs)).toEqual({ planned: 7, taken: 1 });
  });
});

describe('mise en forme', () => {
  it('quantités', () => {
    expect(formatAmount(1, 'comprimé')).toBe('1 comprimé');
    expect(formatAmount(0.5, 'comprimé')).toBe('0,5 comprimé');
    expect(formatAmount(2, 'gélule')).toBe('2 gélules');
    expect(formatAmount(5, 'ml')).toBe('5 ml');
  });

  it.each([
    ['1', 1],
    ['0,5', 0.5],
    ['½', 0.5],
    ['2.25', 2.25],
    ['0', null],
    ['1,333', null],
    ['abc', null],
  ])('lit la quantité %j', (text, expected) => {
    expect(parseAmount(text)).toBe(expected);
  });

  it('résume le planning', () => {
    expect(scheduleLabel({ type: 'weekdays', times: one, weekdays: [5, 1] })).toBe(
      'Lun, Ven · 08:00',
    );
    expect(scheduleLabel({ type: 'asNeeded', amount: 1, maxPer24h: 4 })).toBe(
      'À la demande · 4 max / 24 h',
    );
  });

  it('moment de la journée', () => {
    expect(['03:00', '08:00', '13:00', '19:00', '23:00'].map(dayPart)).toEqual([
      'Nuit',
      'Matin',
      'Après-midi',
      'Soir',
      'Nuit',
    ]);
  });
});

describe('rappels de prise', () => {
  const reminder = {
    enabled: true,
    advanceMin: 10,
    repeatEveryMin: 10,
    repeatCount: 2,
    snoozeMin: 15,
    discreet: false,
  };
  const m = med(
    { type: 'daily', times: [{ time: '08:00', amount: 1 }] },
    { name: 'Doliprane', strength: '500 mg', unit: 'comprimé', reminder },
  );
  const ids = (list) => list.map((a) => a.id.split('#')[1]);

  it("se déclenche à l'avance puis se répète un nombre limité de fois", () => {
    expect(doseAlerts([m], [], at('2026-10-07T07:49'), new Set())).toEqual([]);
    expect(ids(doseAlerts([m], [], at('2026-10-07T07:50'), new Set()))).toEqual(['0']);
    expect(ids(doseAlerts([m], [], at('2026-10-07T08:00'), new Set()))).toEqual(['1']);
    expect(ids(doseAlerts([m], [], at('2026-10-07T09:30'), new Set()))).toEqual(['2']);
  });

  it('ne répète pas un rappel déjà affiché', () => {
    const [alert] = doseAlerts([m], [], at('2026-10-07T07:55'), new Set());
    expect(doseAlerts([m], [], at('2026-10-07T07:58'), new Set([alert.id]))).toEqual([]);
  });

  it("s'arrête une fois la prise faite, et repart à la fin d'un report", () => {
    const base = { medId: 'm1', date: '2026-10-07', time: '08:00', scheduled: true };
    const taken = { ...base, status: 'taken', takenAt: '2026-10-07T08:01' };
    expect(doseAlerts([m], [taken], at('2026-10-07T08:05'), new Set())).toEqual([]);
    const snoozed = { ...base, status: 'snoozed', snoozeUntil: '2026-10-07T08:30' };
    expect(doseAlerts([m], [snoozed], at('2026-10-07T08:20'), new Set())).toEqual([]);
    expect(doseAlerts([m], [snoozed], at('2026-10-07T08:30'), new Set())).toHaveLength(1);
  });

  it('rien si les rappels sont coupés ou le traitement archivé', () => {
    const off = { ...m, reminder: { ...reminder, enabled: false } };
    expect(
      doseAlerts([off, { ...m, active: false }], [], at('2026-10-07T08:00'), new Set()),
    ).toEqual([]);
  });

  it('mode discret : aucun nom de médicament', () => {
    const occurrence = { time: '08:00', amount: 1 };
    expect(alertText({ med: m, occurrence })).toEqual({
      title: 'Prise : Doliprane 500 mg',
      body: '1 comprimé à 08:00',
    });
    const discreet = { ...m, reminder: { ...reminder, discreet: true } };
    expect(JSON.stringify(alertText({ med: discreet, occurrence }))).not.toContain('Doliprane');
  });
});
