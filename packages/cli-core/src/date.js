import { fail } from "./errors.js";

/**
 * Parses a date specification string into a Date object.
 * Supports ISO8601 strings and relative durations (e.g., "2w", "10d", "1mo").
 * 
 * Supported relative units:
 * - h: hours
 * - d: days
 * - w: weeks
 * - m: months
 * - y: years
 * 
 * @param {string} input 
 * @returns {Date}
 */
export function parseDateSpec(input) {
  if (!input) {
    return null;
  }

  // ISO8601 check
  const isoDate = new Date(input);
  if (!isNaN(isoDate.getTime()) && input.includes("-")) {
    return isoDate;
  }

  // Relative duration check
  const match = input.match(/^(\d+)([a-z]+)$/i);
  if (match) {
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const date = new Date();

    switch (unit) {
      case "h":
        date.setHours(date.getHours() - value);
        return date;
      case "d":
        date.setDate(date.getDate() - value);
        return date;
      case "w":
        date.setDate(date.getDate() - value * 7);
        return date;
      case "m":
        date.setMonth(date.getMonth() - value);
        return date;
      case "y":
        date.setFullYear(date.getFullYear() - value);
        return date;
      default:
        break;
    }
  }

  fail(`invalid date specification: ${input}. Supported formats: ISO8601 or relative durations like 2w, 10d, 1m.`, 2);
}
