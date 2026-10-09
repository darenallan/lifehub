import { describe, expect, it } from 'vitest';
import {
  adherence,
  dailyRates,
  dayTone,
  outcome,
  streak,
  symptomCorrelation,
} from '../../src/lib/health/adherence.js';
import {
  appointmentAlerts,
  appointmentTitle,
  appointmentsOn,
  pastAppointments,
  upcomingAppointments,
  whenLabel,
} from '../../src/lib/health/care.js';
import { allTypes } from '../../src/lib/health/measures.js';
import { csvCell, dosesCsv, measuresCsv, toCsv } from '../../src/lib/health/report.js';
import { parseStamp } from '../../src/lib/health/schedule.js';

const at = (stamp) => parseStamp(stamp);

describe('rendez-vous', () => {
  const rdv = (id, stamp, data = {}) => ({
    id,
    at: stamp,
    status: 'planned',
    doctorId: null,
    reason: null,
    remindDayBefore: true,
    remindHoursBefore: 2,
    ...data,
  });
  const list = [
    rdv('a', '2026-10-09T09:30'),
    rdv('b', '2026-10-07T10:00'),
    rdv('c', '2026-10-20T15:00', { status: 'cancelled' }),
  ];

  it('à venir et passés', () => {
    const now = at('2026-10-08T12:00');
    expect(upcomingAppointments(list, now).map((a) => a.id)).toEqual(['a']);
    expect(pastAppointments(list, now).map((a) => a.id)).toEqual(['c', 'b']);
    expect(appointmentsOn(list, '2026-10-09').map((a) => a.id)).toEqual(['a']);
  });

  it('rappel la veille, puis N heures avant, puis plus rien', () => {
    const one = [rdv('a', '2026-10-09T09:30')];
    expect(appointmentAlerts(one, at('2026-10-08T09:29'), new Set())).toEqual([]);
    const [dayBefore] = appointmentAlerts(one, at('2026-10-08T09:30'), new Set());
    expect(dayBefore.id).toBe('rdv|a|day');
    expect(appointmentAlerts(one, at('2026-10-08T20:00'), new Set([dayBefore.id]))).toEqual([]);
    const [hours] = appointmentAlerts(one, at('2026-10-09T07:30'), new Set([dayBefore.id]));
    expect(hours.id).toBe('rdv|a|hours');
    expect(appointmentAlerts(one, at('2026-10-09T09:30'), new Set())).toEqual([]);
  });

  it('libellés', () => {
    expect(whenLabel('2026-10-08T14:00', '2026-10-08', '2026-10-09')).toBe("Aujourd'hui 14:00");
    expect(whenLabel('2026-10-09T09:30', '2026-10-08', '2026-10-09')).toBe('Demain 09:30');
    expect(whenLabel('2026-10-20T09:30', '2026-10-08', '2026-10-09')).toBe('20/10 09:30');
    const doctors = [{ id: 'd1', name: 'Dr Kouassi' }];
    expect(appointmentTitle({ doctorId: 'd1' }, doctors)).toBe('Dr Kouassi');
    expect(appointmentTitle({ doctorId: null, reason: 'Prise de sang' }, doctors)).toBe(
      'Prise de sang',
    );
  });
});

describe('observance', () => {
  const med = {
    id: 'm1',
    name: 'Med',
    active: true,
    startDate: '2026-10-01',
    endDate: null,
    unit: 'comprimé',
    schedule: {
      type: 'daily',
      times: [
        { time: '08:00', amount: 1 },
        { time: '20:00', amount: 1 },
      ],
    },
  };
  const log = (date, time, status, takenAt = null) => ({
    medId: 'm1',
    date,
    time,
    status,
    takenAt,
    amount: 1,
    scheduled: true,
    note: null,
  });
  const logs = [
    log('2026-10-01', '08:00', 'taken', '2026-10-01T08:05'),
    log('2026-10-01', '20:00', 'taken', '2026-10-01T23:30'), // en retard
    log('2026-10-02', '08:00', 'skipped'),
    // 2026-10-02 20:00 : rien de noté → manquée
    log('2026-10-03', '08:00', 'taken', '2026-10-03T08:00'),
    log('2026-10-03', '20:00', 'taken', '2026-10-03T20:10'),
  ];
  // À 09:00 le 04, la prise de 08:00 est encore « à prendre » : pas encore jugée.
  const now = at('2026-10-04T09:00');

  it('classe chaque prise', () => {
    expect(outcome({ date: '2026-10-01', time: '20:00' }, logs[1], now)).toBe('late');
    expect(outcome({ date: '2026-10-04', time: '08:00' }, null, now)).toBeNull();
  });

  it('taux global, par médicament et par moment de la journée', () => {
    const result = adherence([med], logs, '2026-10-01', '2026-10-04', now);
    expect(result.overall).toEqual({
      onTime: 3,
      late: 1,
      skipped: 1,
      missed: 1,
      total: 6,
      pct: 67,
    });
    expect(result.byMed[0]).toMatchObject({ total: 6, pct: 67 });
    expect(result.byPart.Soir).toMatchObject({ onTime: 1, late: 1, missed: 1, total: 3 });
  });

  it('calendrier et série', () => {
    const rates = dailyRates([med], logs, '2026-10-01', '2026-10-03', now);
    expect(rates.get('2026-10-01')).toEqual({ taken: 2, total: 2 });
    expect(dayTone(rates.get('2026-10-02'))).toBe('low');
    expect(dayTone(rates.get('2026-10-03'))).toBe('full');
    expect(dayTone(undefined)).toBe('none');
    // Le 04 n'a pas encore de prise jugée, le 03 est complet, le 02 casse la série.
    expect(streak([med], logs, '2026-10-04', now)).toBe(1);
  });

  it('lien descriptif symptômes / oublis', () => {
    const journals = [
      { date: '2026-10-02', symptoms: [{ name: 'Fatigue' }] },
      { date: '2026-10-03', symptoms: [{ name: 'Fatigue' }] },
      { date: '2026-10-01', symptoms: [{ name: 'Toux' }] },
    ];
    expect(symptomCorrelation([med], logs, journals, '2026-10-01', '2026-10-03', now)).toEqual([
      { name: 'Fatigue', days: 2, withMissed: 100, withoutMissed: 50 },
    ]);
  });
});

describe('exports CSV', () => {
  it('protège les cellules (guillemets, formules)', () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('dit "oui"')).toBe('"dit ""oui"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell(null)).toBe('');
    expect(toCsv([['a', 'b']])).toBe('﻿a;b\r\n');
  });

  it('mesures de la période', () => {
    const measures = [
      {
        typeKey: 'weight',
        date: '2026-10-02',
        at: '2026-10-02T07:00',
        values: { value: 78.5 },
        context: 'fasting',
        note: null,
      },
      { typeKey: 'weight', date: '2026-09-01', at: '2026-09-01T07:00', values: { value: 80 } },
    ];
    const csv = measuresCsv(measures, allTypes([]), '2026-10-01', '2026-10-31');
    expect(csv.split('\r\n')[1]).toBe('2026-10-02;07:00;Poids;78,5 kg;À jeun;');
    expect(csv).not.toContain('2026-09-01');
  });

  it('prises planifiées (dont manquées) et à la demande', () => {
    const med = {
      id: 'm1',
      name: 'Med',
      unit: 'comprimé',
      startDate: '2026-10-01',
      endDate: '2026-10-01',
      schedule: { type: 'daily', times: [{ time: '08:00', amount: 0.5 }] },
    };
    const logs = [
      {
        medId: 'm1',
        scheduled: false,
        status: 'taken',
        date: '2026-10-01',
        takenAt: '2026-10-01T15:00',
        amount: 1,
        note: 'Mal de tête',
      },
    ];
    const lines = dosesCsv([med], logs, '2026-10-01', '2026-10-01', () => true).split('\r\n');
    expect(lines[1]).toBe('2026-10-01;08:00;Med;0,5;comprimé;Manquée;;');
    expect(lines[2]).toBe('2026-10-01;;Med (à la demande);1;comprimé;Prise;15:00;Mal de tête');
  });
});

