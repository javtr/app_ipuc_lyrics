import { SongSection, SongSectionType } from '../types';

/**
 * Convierte un arreglo de SongSection[] estructuradas a un texto plano legible
 * en formato ChordPro con directivas de sección entre llaves: {tipo: Etiqueta}.
 */
export function serializeSectionsToText(sections: SongSection[]): string {
  if (!sections || sections.length === 0) return '';

  return sections
    .map(section => {
      const header = `{${section.type}: ${section.label}}`;
      const body = section.lines.join('\n');
      return `${header}\n${body}`;
    })
    .join('\n\n');
}

/**
 * Parsea un texto en formato ChordPro con directivas {tipo: Etiqueta}
 * a un arreglo estructurado de SongSection[].
 * Si el usuario no incluye directivas, divide inteligentemente por bloques vacíos.
 */
export function parseTextToSections(rawText: string): SongSection[] {
  if (!rawText.trim()) {
    return [];
  }

  const rawLines = rawText.split('\n');
  const sections: SongSection[] = [];
  let currentSection: SongSection | null = null;
  let verseCounter = 1;
  let chorusCounter = 1;

  const pushSection = (sec: SongSection) => {
    // Limpiar líneas vacías al inicio y al final de la sección
    while (sec.lines.length > 0 && !sec.lines[sec.lines.length - 1].trim()) {
      sec.lines.pop();
    }
    while (sec.lines.length > 0 && !sec.lines[0].trim()) {
      sec.lines.shift();
    }
    if (sec.lines.length > 0) {
      sections.push(sec);
    }
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();

    // Detección de directiva de sección: {verse: Verso 1} o {chorus: Coro}
    const directiveMatch = trimmed.match(/^\{([a-zA-Z]+)(?::\s*([^}]+))?\}$/);

    if (directiveMatch) {
      if (currentSection) {
        pushSection(currentSection);
      }

      const rawType = directiveMatch[1].toLowerCase();
      const validTypes: SongSectionType[] = ['verse', 'chorus', 'bridge', 'tag', 'intro', 'outro'];
      const sectionType: SongSectionType = validTypes.includes(rawType as SongSectionType)
        ? (rawType as SongSectionType)
        : 'verse';

      const label = directiveMatch[2]?.trim() || getDefaultLabel(sectionType, verseCounter, chorusCounter);

      currentSection = {
        id: `sec_${Date.now()}_${sections.length + 1}`,
        type: sectionType,
        label,
        lines: []
      };

      if (sectionType === 'verse') verseCounter++;
      if (sectionType === 'chorus') chorusCounter++;
      continue;
    }

    // Si encontramos una línea en blanco y no estamos usando directivas formales
    if (!trimmed && currentSection && currentSection.lines.length > 0) {
      const nextLine = rawLines[i + 1]?.trim();
      if (nextLine && !nextLine.startsWith('{')) {
        pushSection(currentSection);
        currentSection = null;
        continue;
      }
    }

    // Línea de letra o acordes
    if (trimmed || (currentSection && currentSection.lines.length > 0)) {
      if (!currentSection) {
        currentSection = {
          id: `sec_${Date.now()}_${sections.length + 1}`,
          type: 'verse',
          label: `Verso ${verseCounter++}`,
          lines: []
        };
      }
      currentSection.lines.push(line);
    }
  }

  if (currentSection) {
    pushSection(currentSection);
  }

  return sections;
}

function getDefaultLabel(type: SongSectionType, verseNum: number, chorusNum: number): string {
  switch (type) {
    case 'verse': return `Verso ${verseNum}`;
    case 'chorus': return chorusNum > 1 ? `Coro ${chorusNum}` : 'Coro';
    case 'bridge': return 'Puente';
    case 'tag': return 'Tag';
    case 'intro': return 'Intro';
    case 'outro': return 'Final';
    default: return 'Sección';
  }
}
