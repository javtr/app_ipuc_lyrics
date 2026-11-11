import React from 'react';
import { groupChordTokensIntoWords, parseChordProLine } from '../services/chordParser';

interface ChordProLineViewProps {
  line: string;
  chordClassName: string;
  lyricClassName: string;
  spacerHeightClass?: string;
}

/**
 * Renderiza una línea ChordPro agrupada por palabras completas para que los acordes
 * intercalados en sílabas no corten ni separen visualmente las palabras.
 */
export const ChordProLineView: React.FC<ChordProLineViewProps> = ({
  line,
  chordClassName,
  lyricClassName,
  spacerHeightClass = 'h-2.5 sm:h-3'
}) => {
  if (!line.trim()) {
    return <div className="h-4" />;
  }

  const tokens = parseChordProLine(line);
  const wordGroups = groupChordTokensIntoWords(tokens);

  return (
    <div className="flex flex-wrap items-end py-0.5">
      {wordGroups.map((group, gIdx) => {
        if (group.isSpace) {
          const spaceToken = group.tokens[0];
          return (
            <span key={gIdx} className="inline-flex flex-col">
              {spaceToken.chord ? (
                <span className={`font-bold text-emerald-400 leading-none select-all font-sans pr-1 ${chordClassName}`}>
                  {spaceToken.chord}
                </span>
              ) : (
                <span className={`${spacerHeightClass} leading-none select-none`} />
              )}
              <span className={`text-slate-100 font-sans whitespace-pre ${lyricClassName}`}>
                {spaceToken.text}
              </span>
            </span>
          );
        }

        return (
          <span key={gIdx} className="inline-flex items-end whitespace-nowrap">
            {group.tokens.map((token, tIdx) => (
              <span key={tIdx} className="inline-flex flex-col">
                {token.chord ? (
                  <span
                    className={`font-bold text-emerald-400 leading-none select-all font-sans ${
                      !token.text ? 'pr-1.5' : ''
                    } ${chordClassName}`}
                  >
                    {token.chord}
                  </span>
                ) : (
                  <span className={`${spacerHeightClass} leading-none select-none`} />
                )}
                <span className={`text-slate-100 font-sans whitespace-pre ${lyricClassName}`}>
                  {token.text || ' '}
                </span>
              </span>
            ))}
          </span>
        );
      })}
    </div>
  );
};
