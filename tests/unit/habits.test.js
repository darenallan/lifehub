import { describe, expect, it } from 'vitest';
import { formatMonth, isMonday, isMonthKey, monthDays, shiftMonth } from '../../src/lib/dates.js';
import {
  activeHabits,
  checkKey,
  currentStreak,
  dailyProgress,
  formatPct,
  formatSleep,
  habitStats,
  indexChecks,
  journalAverages,
  progress,
  topHabits,
  weeklyProgress,
  weeksOf,
} from '../../src/lib/habits.js';

const sport = { id: 'h1', name: 'Sport', order: 0, active: true };
const lecture = { id: 'h2', name: 'Lecture', order: 1, active: true };
const vieux = { id: 'h3', name: 'Ancien', order: 2, active: false };
const habits = [sport, lecture];

const checks = (pairs) => pairs.map(([habitId, day, done = true]) => ({ habitId, day, done }));

describe('dates du mois', () => {
  it('liste les jours et navigue entre mois', () => {
    expect(monthDays('2026-02')).toHaveLength(28);
    expect(monthDays('2026-10')[0]).toBe('2026-10-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(formatMonth('2026-10')).toBe('octobre 2026');
    expect(isMonday('2026-10-05')).toBe(true);
  });

  it.each(['2026-10', '1999-01'])('mois valide %s', (k) => expect(isMonthKey(k)).toBe(true));
  it.each(['2026-13', '2026-00', '2026-1', '', undefined])('mois invalide %s', (k) =>
    expect(isMonthKey(k)).toBe(false),
  );
});

describe('indexChecks / activeHabits', () => {
  it('ignore les cases décochées', () => {
    const done = indexChecks(
      checks([
        ['h1', '2026-10-01'],
        ['h2', '2026-10-01', false],
      ]),
    );
    expect(done.has(checkKey('h1', '2026-10-01'))).toBe(true);
    expect(done.has(checkKey('h2', '2026-10-01'))).toBe(false);
  });

  it('garde les actives, triées par ordre', () => {
    expect(activeHabits([lecture, vieux, sport]).map((h) => h.id)).toEqual(['h1', 'h2']);
  });
});

describe('progression', () => {
  const days = monthDays('2026-10'); // 31 jours
  const done = indexChecks(
    checks([
      ['h1', '2026-10-01'],
      ['h1', '2026-10-02'],
      ['h2', '2026-10-02'],
      ['h1', '2026-10-05'],
    ]),
  );

  it('anneau du mois : objectif = habitudes actives × jours', () => {
    expect(progress(habits, done, days)).toEqual({
      goal: 62,
      done: 4,
      remaining: 58,
      pct: 4 / 62,
    });
  });

  it('aucune habitude : 0 %, pas de division par zéro', () => {
    expect(progress([], done, days).pct).toBe(0);
  });

  it('% par jour', () => {
    const daily = dailyProgress(habits, done, days);
    expect(daily[0]).toMatchObject({ day: '2026-10-01', done: 1, goal: 2, pct: 0.5 });
    expect(daily[1].pct).toBe(1);
    expect(daily[2].pct).toBe(0);
  });

  it('semaines ISO du mois, partielles aux bords', () => {
    const weeks = weeksOf(days);
    expect(weeks.map((w) => w.week)).toEqual([
      '2026-W40',
      '2026-W41',
      '2026-W42',
      '2026-W43',
      '2026-W44',
    ]);
    expect(weeks[0].days).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(weeks.at(-1).days.at(-1)).toBe('2026-10-31');
  });

  it('% par semaine', () => {
    const [w40, w41] = weeklyProgress(habits, done, days);
    expect(w40).toMatchObject({ goal: 8, done: 3 });
    expect(w41).toMatchObject({ goal: 14, done: 1 });
  });

  it('analyse et top', () => {
    const stats = habitStats(habits, done, days);
    expect(stats[0]).toMatchObject({ habit: sport, goal: 31, done: 3, remaining: 28 });
    expect(topHabits(habits, done, days).map((s) => s.habit.id)).toEqual(['h1', 'h2']);
    expect(topHabits(habits, indexChecks([]), days)).toEqual([]);
  });
});

describe('currentStreak', () => {
  const today = new Date(2026, 9, 4);

  it("compte jusqu'à aujourd'hui", () => {
    const done = indexChecks(
      checks([
        ['h1', '2026-10-02'],
        ['h1', '2026-10-03'],
        ['h1', '2026-10-04'],
      ]),
    );
    expect(currentStreak('h1', done, today)).toBe(3);
  });

  it("aujourd'hui non coché ne casse pas la série", () => {
    const done = indexChecks(
      checks([
        ['h1', '2026-10-02'],
        ['h1', '2026-10-03'],
      ]),
    );
    expect(currentStreak('h1', done, today)).toBe(2);
  });

  it('un trou remet à zéro, à travers les mois', () => {
    const done = indexChecks(
      checks([
        ['h1', '2026-09-30'],
        ['h1', '2026-10-01'],
        ['h1', '2026-10-03'],
      ]),
    );
    expect(currentStreak('h1', done, today)).toBe(1);
    const cross = indexChecks(
      checks([
        ['h1', '2026-09-30'],
        ['h1', '2026-10-01'],
      ]),
    );
    expect(currentStreak('h1', cross, new Date(2026, 9, 1))).toBe(2);
  });
});

describe('journal', () => {
  it('moyennes sur les jours renseignés seulement', () => {
    expect(
      journalAverages([
        { mood: 4, sleepMinutes: 420 },
        { mood: 2, sleepMinutes: null },
        { mood: null, sleepMinutes: 480 },
      ]),
    ).toEqual({ mood: 3, sleepMinutes: 450 });
    expect(journalAverages([])).toEqual({ mood: null, sleepMinutes: null });
  });

  it('formatage', () => {
    expect(formatSleep(450)).toBe('7 h 30');
    expect(formatSleep(480)).toBe('8 h');
    expect(formatSleep(null)).toBe('—');
    expect(formatPct(0.666)).toBe('67 %');
  });
});
