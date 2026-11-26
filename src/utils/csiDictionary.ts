export const CSI_DIVISIONS: Record<string, string> = {
  '00': 'Procurement & Contracting Requirements',
  '01': 'General Requirements',
  '02': 'Existing Conditions',
  '03': 'Concrete',
  '04': 'Masonry',
  '05': 'Metals',
  '06': 'Wood, Plastics, and Composites',
  '07': 'Thermal and Moisture Protection',
  '08': 'Openings',
  '09': 'Finishes',
  '10': 'Specialties',
  '11': 'Equipment',
  '12': 'Furnishings',
  '13': 'Special Construction',
  '14': 'Conveying Equipment',
  '21': 'Fire Suppression',
  '22': 'Plumbing',
  '23': 'Heating, Ventilating, and Air Conditioning (HVAC)',
  '25': 'Integrated Automation',
  '26': 'Electrical',
  '27': 'Communications',
  '28': 'Electronic Safety and Security',
  '31': 'Earthwork',
  '32': 'Exterior Improvements',
  '33': 'Utilities',
  '48': 'Electrical Power Generation',
};

export function getDivisionTitle(divCode: string): string {
  return CSI_DIVISIONS[divCode] ?? `Division ${divCode}`;
}

/**
 * Normalizes inconsistent CSI section codes:
 *  - "08 71 00" -> "08 71 00"
 *  - "08 7100"  -> "08 71 00"
 *  - "087100"   -> "08 71 00"
 *  - "08710"    -> "08 71 00" (legacy 5-digit MasterFormat '95)
 *  - "13 31 00.13" -> "13 31 00.13"
 */
export function normalizeCsiCode(raw: string): string {
  const cleaned = raw.trim().replace(/^SECTION\s+/i, '');
  const subSplit = cleaned.split('.');
  const mainDigits = subSplit[0].replace(/\D/g, '');
  const suffix = subSplit[1] ? `.${subSplit[1].replace(/\D/g, '').slice(0, 2).padEnd(2, '0')}` : '';

  if (mainDigits.length === 6) {
    return `${mainDigits.slice(0, 2)} ${mainDigits.slice(2, 4)} ${mainDigits.slice(4, 6)}${suffix}`;
  }
  if (mainDigits.length === 5) {
    // Legacy 5-digit format e.g. 08710 -> 08 71 00
    return `${mainDigits.slice(0, 2)} ${mainDigits.slice(2, 4)} ${mainDigits.slice(4, 5)}0${suffix}`;
  }
  return cleaned;
}

export interface RiskPattern {
  label: string;
  category: 'Tolerance / Unit' | 'Scope / Liability' | 'Cost / Allowance';
  regex: RegExp;
}

export const RISK_PATTERNS: RiskPattern[] = [
  {
    label: 'PSI / Strength / AIC',
    category: 'Tolerance / Unit',
    regex: /\b\d[\d,]*(?:\.\d+)?\s*(?:psi|ksi|mpa|k?aic)\b/gi,
  },
  {
    label: 'Thickness / Gauge / Mil',
    category: 'Tolerance / Unit',
    regex: /\b\d+(?:\.\d+)?\s*(?:mil|mils|mm|cm|ga|gauge|in\.|inch|inches)\b/gi,
  },
  {
    label: 'Fire / Time Rating',
    category: 'Tolerance / Unit',
    regex: /\b\d+(?:\.\d+)?[-\s]?(?:hr|hour|hours|min|minute|minutes|year|years|yr|yrs)\b/gi,
  },
  {
    label: 'Currency / Percentage',
    category: 'Cost / Allowance',
    regex: /(?:\$\s?\d[\d,]*(?:\.\d{1,2})?|\b\d+(?:\.\d+)?%)/gi,
  },
  {
    label: 'Furnish & Install / By Owner',
    category: 'Scope / Liability',
    regex: /\b(?:furnish\s+and\s+install|furnish\s+only|install\s+only|by\s+owner|owner[- ]furnished|contractor[- ]installed|ofci|cfci)\b/gi,
  },
  {
    label: 'Warranty / Indemnification',
    category: 'Scope / Liability',
    regex: /\b(?:warranty|warranties|guaranteed?|ndl|liquidated\s+damages|retainage)\b/gi,
  },
  {
    label: 'Allowance / Alternate',
    category: 'Cost / Allowance',
    regex: /\b(?:allowance|allowances|alternate|alternates|unit\s+price|add\s+alternate|deduct)\b/gi,
  },
  {
    label: 'Substitution / Basis of Design',
    category: 'Scope / Liability',
    regex: /\b(?:basis\s+of\s+design|approved\s+equal|or\s+equal|no\s+substitutions?|sole\s+source)\b/gi,
  },
  {
    label: 'Contractual Directive',
    category: 'Scope / Liability',
    regex: /\b(?:shall\s+not|delete|deleted|omitted|excluded|mandatory)\b/gi,
  },
];

export function detectRiskFlags(text: string): string[] {
  const found = new Set<string>();
  for (const pattern of RISK_PATTERNS) {
    pattern.regex.lastIndex = 0;
    const matches = text.match(pattern.regex);
    if (matches && matches.length > 0) {
      const sample = matches[0].trim();
      found.add(`${pattern.label}: ${sample}`);
    }
  }
  return Array.from(found);
}

export function findRiskMatchInToken(tokenText: string): string | undefined {
  for (const pattern of RISK_PATTERNS) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(tokenText)) {
      return pattern.category;
    }
  }
  return undefined;
}

/**
 * Evaluates risk patterns across a sliding window around a changed token so multi-word
 * phrases like "3,000" + " psi" or "furnish" + " and install" still highlight the changed token.
 */
export function extractContextRiskMatch(
  prevContext: string,
  tokenText: string,
  nextContext: string
): string | undefined {
  if (!tokenText.trim()) return undefined;
  const direct = findRiskMatchInToken(tokenText);
  if (direct) return direct;

  const combined = `${prevContext}${tokenText}${nextContext}`;
  const tokenStart = prevContext.length;
  const tokenEnd = tokenStart + tokenText.length;

  for (const pattern of RISK_PATTERNS) {
    const re = new RegExp(pattern.regex.source, 'gi');
    let match: RegExpExecArray | null;
    while ((match = re.exec(combined)) !== null) {
      const mStart = match.index;
      const mEnd = mStart + match[0].length;
      if (mStart < tokenEnd && mEnd > tokenStart) {
        return pattern.category;
      }
      if (match[0].length === 0) break;
    }
  }
  return undefined;
}

const DELTA_UNIT_GROUPS: Array<{ label: string; regex: RegExp }> = [
  { label: 'Strength', regex: /\b\d[\d,]*(?:\.\d+)?\s*(?:psi|ksi|mpa)\b/gi },
  { label: 'Gauge / Mil', regex: /\b\d+(?:\.\d+)?\s*(?:mil|mils|mm|ga|gauge)\b/gi },
  { label: 'Rating / Term', regex: /\b\d+(?:\.\d+)?[-\s]?(?:hr|hour|hours|year|years|yr|yrs)\b/gi },
  { label: 'Cost', regex: /(?:\$\s?\d[\d,]*(?:\.\d{1,2})?|\b\d+(?:\.\d+)?%)/gi },
  { label: 'AIC', regex: /\b\d[\d,]*\s*(?:k?aic)\b/gi },
];

export function extractParagraphDeltaChips(oldText: string, newText: string): string[] {
  const chips: string[] = [];
  if (!oldText || !newText) return chips;

  for (const group of DELTA_UNIT_GROUPS) {
    const oldMatches = (oldText.match(new RegExp(group.regex.source, 'gi')) ?? []).map((s) =>
      s.replace(/\s+/g, ' ').trim()
    );
    const newMatches = (newText.match(new RegExp(group.regex.source, 'gi')) ?? []).map((s) =>
      s.replace(/\s+/g, ' ').trim()
    );
    if (oldMatches.length > 0 && newMatches.length > 0) {
      const firstDiffIdx = oldMatches.findIndex((m, idx) => newMatches[idx] && m.toLowerCase() !== newMatches[idx].toLowerCase());
      if (firstDiffIdx !== -1) {
        chips.push(`${group.label}: ${oldMatches[firstDiffIdx]} → ${newMatches[firstDiffIdx]}`);
      } else if (oldMatches[0].toLowerCase() !== newMatches[0].toLowerCase()) {
        chips.push(`${group.label}: ${oldMatches[0]} → ${newMatches[0]}`);
      }
    }
  }

  const scopeRe = /\b(furnish\s+and\s+install|furnish\s+only|install\s+only|by\s+owner|owner[- ]furnished|contractor[- ]installed)\b/i;
  const oldScope = oldText.match(scopeRe)?.[1];
  const newScope = newText.match(scopeRe)?.[1];
  if (oldScope && newScope && oldScope.toLowerCase() !== newScope.toLowerCase()) {
    chips.push(`Scope: ${oldScope} → ${newScope}`);
  }

  return chips.slice(0, 3);
}
