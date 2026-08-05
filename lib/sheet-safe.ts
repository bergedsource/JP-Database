// Neutralize spreadsheet formula/command injection (CSV/Sheets injection).
//
// Google Sheets writes here use valueInputOption "USER_ENTERED", which parses a
// cell beginning with = + - @ (or a leading tab/CR) as a live formula. Any cell
// carrying user-supplied text (member names, fine descriptions, officers, notes)
// must be routed through sheetSafe() so a value like `=IMPORTXML("evil","//a")`
// is stored as literal text instead of executing.
//
// A leading apostrophe forces Sheets to treat the value as a string; the
// apostrophe itself is not displayed. Non-string values pass through untouched
// so numeric/boolean cells (amounts, TRUE/FALSE checkboxes) keep parsing.
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function sheetSafe(value: string): string {
  return FORMULA_TRIGGER.test(value) ? `'${value}` : value;
}
