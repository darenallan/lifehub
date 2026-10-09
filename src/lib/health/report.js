// Rapport pour le médecin (phase 7.5) : exports CSV. Logique pure, testée.
// Séparateur « ; » et BOM UTF-8 : le fichier s'ouvre correctement dans Excel en français.
import { CONTEXTS, formatReading } from './measures.js';
import { indexLogs, occurrencesBetween } from './schedule.js';

const STATUS = { taken: 'Prise', skipped: 'Ignorée', snoozed: 'Reportée' };

/**
 * Cellule CSV sûre : guillemets doublés, et une apostrophe devant =, +, -, @ (ou tabulation)
 * pour qu'un tableur n'exécute jamais une formule venue d'une note saisie.
 */
export function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows) {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

const decimal = (n) => String(n).replace('.', ',');

/** Mesures de la période : Date;Heure;Type;Mesure;Contexte;Note. */
export function measuresCsv(measures, types, from, to) {
  const byKey = new Map(types.map((t) => [t.key, t]));
  const rows = measures
    .filter((m) => m.date >= from && m.date <= to && byKey.has(m.typeKey))
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((m) => {
      const type = byKey.get(m.typeKey);
      return [
        m.date,
        m.at.slice(11),
        type.label,
        formatReading(type, m.values, m.unit),
        CONTEXTS[m.context] ?? '',
        m.note ?? '',
      ];
    });
  return toCsv([['Date', 'Heure', 'Type', 'Mesure', 'Contexte', 'Note'], ...rows]);
}

function doseRow(date, time, name, amount, unit, status, takenAt, note) {
  return [date, time, name, decimal(amount), unit, status, takenAt ?? '', note ?? ''];
}

/**
 * Prises de la période : planifiées (avec leur statut ; « Manquée » si rien n'a été noté et que
 * isPast(prise) est vrai) puis prises à la demande.
 */
export function dosesCsv(meds, logs, from, to, isPast) {
  const index = indexLogs(logs);
  const byId = new Map(meds.map((m) => [m.id, m]));
  const rows = [];
  for (const med of meds) {
    for (const o of occurrencesBetween(med, from, to)) {
      const log = index.get(o.key);
      const status = log ? STATUS[log.status] : isPast(o) ? 'Manquée' : 'À venir';
      rows.push(
        doseRow(
          o.date,
          o.time,
          med.name,
          o.amount,
          med.unit,
          status,
          log?.takenAt?.slice(11),
          log?.note,
        ),
      );
    }
  }
  for (const log of logs) {
    const med = byId.get(log.medId);
    if (log.scheduled || !med || log.date < from || log.date > to) continue;
    const name = `${med.name} (à la demande)`;
    rows.push(
      doseRow(log.date, '', name, log.amount, med.unit, 'Prise', log.takenAt?.slice(11), log.note),
    );
  }
  const sortKey = (row) => `${row[0]} ${row[1] || row[6]}`;
  rows.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  return toCsv([
    ['Date', 'Heure prévue', 'Médicament', 'Quantité', 'Unité', 'Statut', 'Heure de prise', 'Note'],
    ...rows,
  ]);
}
