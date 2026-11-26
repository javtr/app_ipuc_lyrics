import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getSemitoneDifference,
  groupChordTokensIntoWords,
  parseChordProLine,
  transposeChord,
  transposeChordProText
} from '../src/services/chordParser';
import { parseTextToSections } from '../src/services/chordSerializer';
import {
  CATALOG_PAGE_SIZE,
  buildIndexedCatalog,
  buildOverrideTitle,
  filterAndSortSongsByTitle,
  filterIndexedCatalog,
  generateUniqueSongSlug,
  getSongInitialLetter,
  getSongOpeningLine,
  groupEntriesAlphabetically,
  hasChordAnnotations,
  matchesSongTitleOrLyrics,
  normalizeSearchText,
  paginateCatalogItems,
  restoreChordsInEditedSections
} from '../src/services/songEditorHelper';
import { resolveSongForDisplay, isSongVisibleInSede } from '../src/services/songResolver';
import { compressSetlist, copyTextToClipboard, decompressSetlist } from '../src/services/urlSharing';
import { importBackupFromJson } from '../src/services/backupService';
import {
  getStoredSedes,
  normalizeSedeSlug,
  saveCustomSede,
  syncGeneralCatalog
} from '../src/services/gitSyncService';
import { db, initializeDatabase } from '../src/db';
import { MusicianView } from '../src/components/MusicianView';
import { ReaderView } from '../src/components/ReaderView';
import { ProjectionView } from '../src/components/ProjectionView';
import { SetlistManager } from '../src/components/SetlistManager';
import { CorrectionModal } from '../src/components/CorrectionModal';
import { MobileBottomNav } from '../src/components/MobileBottomNav';
import { ConfirmDialogModal } from '../src/components/ConfirmDialogModal';
import { SedeSelector } from '../src/components/SedeSelector';
import { SongEditorModal } from '../src/components/SongEditorModal';
import { canSessionEditSede } from '../src/services/cloudApiService';
import { BaseSong, DisplaySong, SedeProfile, SedeSongOverride, Setlist, SongSection } from '../src/types';

vi.mock('../src/hooks/useWakeLock', () => ({
  useWakeLock: () => ({
    isSupported: false,
    isActive: false,
    requestWakeLock: vi.fn(),
    releaseWakeLock: vi.fn(),
    toggleWakeLock: vi.fn()
  })
}));

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    }
  };
}

describe('Estabilización y Regresión: Validación + Nuevos Hallazgos + Correcciones', () => {
  const baseSong: BaseSong = {
    id: 'sublime-gracia',
    title: 'Sublime Gracia',
    artist: 'John Newton',
    originalKey: 'G',
    bpm: 72,
    timeSignature: '3/4',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sections: [
      {
        id: 'v1',
        type: 'verse',
        label: 'Verso 1',
        lines: [
          '[G]Sublime gracia del [C]Señor[G]',
          'Per[Em]dido y Él [D]me ha[G]lló'
        ]
      }
    ]
  };

  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('[C1/E3] preserva los acordes de líneas no editadas cuando se corrige una canción en Modo Lector', () => {
    const original: SongSection[] = [
      {
        id: 'v1',
        type: 'verse',
        label: 'Verso 1',
        lines: [
          '[G]Sublime gracia del [C]Señor[G]',
          'Que a un [Em]infeliz sal[D]vó'
        ]
      }
    ];

    const editedInReaderMode: SongSection[] = [
      {
        id: 'v1',
        type: 'verse',
        label: 'Verso 1',
        lines: [
          'Sublime gracia del Señor',
          'Que a un pecador salvó'
        ]
      }
    ];

    expect(hasChordAnnotations(original)).toBe(true);
    const merged = restoreChordsInEditedSections(editedInReaderMode, original);

    expect(merged[0].lines[0]).toBe('[G]Sublime gracia del [C]Señor[G]');
    expect(merged[0].lines[1]).toBe('Que a un pecador salvó');
  });

  it('[C2] agrupa sílabas intra-palabra sin dividir "Per[Em]dido" y sin clases gap-x ni xs:inline en MusicianView', () => {
    const tokens = parseChordProLine('Per[Em]dido y Él [D]me ha[G]lló');
    const words = groupChordTokensIntoWords(tokens);

    expect(words.find(w => !w.isSpace && w.tokens.some(t => t.text === 'Per'))?.tokens).toEqual([
      { text: 'Per' },
      { chord: 'Em', text: 'dido' }
    ]);
    expect(words.find(w => !w.isSpace && w.tokens.some(t => t.text === 'ha'))?.tokens).toEqual([
      { text: 'ha' },
      { chord: 'G', text: 'lló' }
    ]);

    const displaySong: DisplaySong = {
      id: baseSong.id,
      title: baseSong.title,
      key: baseSong.originalKey,
      sections: baseSong.sections,
      isLocalOverride: false
    };

    const html = renderToStaticMarkup(
      React.createElement(MusicianView, {
        song: displaySong,
        expectedKey: 'A',
        setlistNav: {
          canPrev: true,
          canNext: false,
          onPrev: vi.fn(),
          onNext: vi.fn(),
          onReturnToSetlist: vi.fn()
        },
        onEnterProjection: vi.fn(),
        onEditFullSong: vi.fn(),
        onReportCorrection: vi.fn()
      })
    );

    expect(html).not.toContain('gap-x-1.5');
    expect(html).not.toContain('xs:inline');
    expect(html).not.toContain('Solo Letra');
    expect(html).not.toContain('Artista:');
    expect(html).not.toContain('Crear versión sede');
    expect(html).not.toContain('>Editar<');
    expect(html).not.toContain('>Scroll<');
    expect(html).not.toContain('Tono:<');
    expect(html).not.toContain('Bajar medio tono');
    expect(html).not.toContain('Subir medio tono');
    expect(html).toContain('flex-nowrap');
    expect(html).toContain('aria-label="Editar canción"');
    expect(html).toContain('Reportar cambios');
    expect(html).toContain('aria-label="Canción anterior del repertorio"');
    expect(html).toContain('>Repertorio<');
    expect(html).toContain('aria-label="Siguiente canción del repertorio"');
    // Tono pre-transpuesto automáticamente desde SetlistItem.key = 'A' (+2 semitonos sobre G -> A, C -> D)
    expect(html).toContain('Tono en repertorio:');
    expect(html).toContain('>A<');
    expect(html).toContain('>D<');
  });

  it('[C3] resolveSongForDisplay auto-transpone cuando el override solo cambia customKey y usa nombre legible de sede', () => {
    const keyOnlyOverride: SedeSongOverride = {
      id: 'sublime-gracia_sede-palestina',
      baseSongId: 'sublime-gracia',
      sedeId: 'sede-palestina',
      customKey: 'A',
      updatedAt: '2026-11-11T12:00:00.000Z'
    };

    const resolved = resolveSongForDisplay(baseSong, 'sede-palestina', [keyOnlyOverride], {
      sedeLabel: 'Sede Palestina'
    });

    expect(resolved.key).toBe('A');
    expect(resolved.title).toBe('Sublime Gracia (Sede Palestina)');
    expect(resolved.sections[0].lines[0]).toBe('[A]Sublime gracia del [D]Señor[A]');
    expect(resolved.sections[0].lines[1]).toBe('Per[F#m]dido y Él [E]me ha[A]lló');
  });

  it('[C3/E2] calcula diferencias de semitono y soporta enarmónicos (Cb, Fb, B#, E#) y tonalidades menores', () => {
    expect(getSemitoneDifference('G', 'A')).toBe(2);
    expect(getSemitoneDifference('G', 'F')).toBe(-2);
    expect(getSemitoneDifference('Em', 'F#m')).toBe(2);
    expect(getSemitoneDifference('Bb', 'C')).toBe(2);
    expect(transposeChord('Cb', 1)).toBe('C');
    expect(transposeChord('E#', 1)).toBe('F#');
  });

  it('[C4] buildOverrideTitle evita concatenar "(Versión ...)" múltiples veces y generateUniqueSongSlug normaliza acentos y colisiones', () => {
    const once = buildOverrideTitle('Sublime Gracia', 'Sublime Gracia', 'Sede Palestina');
    expect(once).toBe('Sublime Gracia (Sede Palestina)');

    const twice = buildOverrideTitle(once, 'Sublime Gracia', 'Sede Palestina', once);
    expect(twice).toBe('Sublime Gracia (Sede Palestina)');

    expect(normalizeSearchText('¡Cuán Grande es Él!')).toBe('¡cuan grande es el!');
    expect(generateUniqueSongSlug('¡Canción de Adoración!', ['sublime-gracia'])).toBe('cancion-de-adoracion');
    expect(
      generateUniqueSongSlug('Canción de Adoración', ['cancion-de-adoracion', 'cancion-de-adoracion-2'])
    ).toBe('cancion-de-adoracion-3');
  });

  it('[C5] SetlistManager renderiza sede legible, indicador Sin descargar y sin clase inexistente slate-850', () => {
    const setlist: Setlist = {
      id: 'setlist_domingo',
      name: 'Culto Domingo',
      date: '2026-11-15',
      sedeId: 'sede-palestina',
      createdAt: '2026-11-11T10:00:00.000Z',
      items: [
        { songId: 'sublime-gracia', key: 'A', order: 1 },
        { songId: 'cancion-no-descargada', key: 'D', order: 2 }
      ]
    };
    const sedes: SedeProfile[] = [
      { id: 'general', name: 'Catálogo General' },
      { id: 'sede-palestina', name: 'Sede Palestina (Caldas)' }
    ];

    const html = renderToStaticMarkup(
      React.createElement(SetlistManager, {
        songs: [baseSong],
        activeSedeId: 'sede-palestina',
        sedesList: sedes,
        savedSetlists: [setlist],
        isMusicianMode: true,
        onSelectSong: vi.fn(),
        onSetlistsUpdated: vi.fn()
      })
    );

    expect(html).toContain('Sede Palestina (Caldas)');
    expect(html).toContain('Sin descargar');
    expect(html).not.toContain('slate-850');
  });

  it('[C5/LAN] copyTextToClipboard recurre a execCommand cuando navigator.clipboard no existe (HTTP en red local)', async () => {
    vi.stubGlobal('navigator', {});
    const execCommand = vi.fn().mockReturnValue(true);
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    const mockTextarea = {
      value: '',
      setAttribute: vi.fn(),
      select: vi.fn(),
      style: {} as Record<string, string>
    };
    vi.stubGlobal('document', {
      execCommand,
      createElement: vi.fn(() => mockTextarea),
      body: { appendChild, removeChild }
    });

    const copied = await copyTextToClipboard('http://192.168.1.50:5173/#repertorio=abc');
    expect(copied).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('[C6] normalizeSedeSlug y saveCustomSede persisten sedes locales incluso tras sincronizar catálogo remoto', async () => {
    expect(normalizeSedeSlug('Chinchiná Norte ')).toBe('chinchina-norte');

    const customSede: SedeProfile = {
      id: 'sede-chinchina',
      name: 'Sede Chinchiná',
      shortName: 'Chinchiná'
    };
    saveCustomSede(customSede);

    vi.stubGlobal('navigator', { onLine: true });
    vi.spyOn(db.songs, 'toArray').mockResolvedValue([]);
    vi.spyOn(db.songs, 'bulkPut').mockResolvedValue('ok' as never);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('sedes.json')) {
        return new Response(
          JSON.stringify([{ id: 'general', name: 'Catálogo General', isDefault: true }]),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify([baseSong]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await syncGeneralCatalog({ force: true });
    expect(res.sedes?.some(s => s.id === 'sede-chinchina')).toBe(true);
    expect(getStoredSedes([]).some(s => s.id === 'sede-chinchina')).toBe(true);
  });

  it('[E2] parseChordProLine preserva texto con corchete sin cerrar y parseTextToSections limpia CRLF', () => {
    const tokens = parseChordProLine('[G hola mundo');
    expect(tokens.map(t => t.text).join('')).toBe('[G hola mundo');

    const sections = parseTextToSections('{verse: Verso 1}\r\nSublime gracia\r\nQue salvó\r\n');
    expect(sections[0].lines).toEqual(['Sublime gracia', 'Que salvó']);
  });

  it('[E2] decompressSetlist produce ID determinístico evitando duplicados', () => {
    const setlist: Setlist = {
      id: 'setlist_1',
      name: 'Culto Domingo',
      date: '2026-11-15',
      sedeId: 'sede-palestina',
      createdAt: '2026-11-11T10:00:00.000Z',
      items: [{ songId: 'sublime-gracia', key: 'A', order: 1 }]
    };

    const compressed = compressSetlist(setlist);
    const first = decompressSetlist(compressed);
    const second = decompressSetlist(compressed);

    expect(first?.id).toBe('imported_culto-domingo_2026-11-15_sede-palestina');
    expect(first?.id).toBe(second?.id);
  });

  it('[E2] importBackupFromJson valida elementos antes de llamar a IndexedDB', async () => {
    const bulkPutSpy = vi.spyOn(db.songs, 'bulkPut').mockResolvedValue('ok' as never);

    const badBackup = JSON.stringify({
      app: 'AppLyrics',
      version: '1.0',
      data: {
        songs: [{ broken: true }],
        overrides: [],
        setlists: []
      }
    });

    await expect(importBackupFromJson(badBackup)).rejects.toThrow(
      'Algunos registros del archivo de respaldo están incompletos o dañados.'
    );
    expect(bulkPutSpy).not.toHaveBeenCalled();
  });

  it('[E2] ReaderView, ProjectionView y CorrectionModal renderizan sin clases rotas ni estados erróneos', () => {
    const displaySong: DisplaySong = {
      id: baseSong.id,
      title: baseSong.title,
      key: baseSong.originalKey,
      sections: [],
      isLocalOverride: false
    };

    const readerHtml = renderToStaticMarkup(
      React.createElement(ReaderView, {
        song: displaySong,
        setlistNav: {
          canPrev: false,
          canNext: true,
          onPrev: vi.fn(),
          onNext: vi.fn(),
          onReturnToSetlist: vi.fn()
        },
        onEnterProjection: vi.fn(),
        onEditSong: vi.fn(),
        onReportCorrection: vi.fn()
      })
    );
    expect(readerHtml).not.toContain('xs:inline');
    expect(readerHtml).not.toContain('Auto-Scroll');
    expect(readerHtml).not.toContain('Editar Letra');
    expect(readerHtml).not.toContain('Ver Acordes');
    expect(readerHtml).not.toContain('Ver acordes para músicos');
    expect(readerHtml).not.toContain('Autor / Artista');
    expect(readerHtml).toContain('flex-nowrap');
    expect(readerHtml).toContain('aria-label="Editar letra de la canción"');
    expect(readerHtml).toContain('Reportar cambios');
    expect(readerHtml).toContain('Proyección');
    expect(readerHtml).toContain('aria-label="Canción anterior del repertorio"');
    expect(readerHtml).toContain('>Repertorio<');
    expect(readerHtml).toContain('aria-label="Siguiente canción del repertorio"');

    const projHtml = renderToStaticMarkup(
      React.createElement(ProjectionView, {
        song: displaySong,
        onClose: vi.fn()
      })
    );
    expect(projHtml).not.toContain('1/0');
    expect(projHtml).toContain('Sin estrofas');

    const corrHtml = renderToStaticMarkup(
      React.createElement(CorrectionModal, {
        song: baseSong,
        isOpen: true,
        onClose: vi.fn()
      })
    );
    expect(corrHtml).toContain('Guardar Sugerencia');
  });

  it('[UX1] getSongOpeningLine y matchesSongTitleOrLyrics extraen frase inicial y buscan por título o contenido ignorando artista y tags', () => {
    const taggedSong: BaseSong = {
      ...baseSong,
      tags: ['adoracion', 'himno']
    };
    const opening = getSongOpeningLine(taggedSong.sections);
    expect(opening).toBe('Sublime gracia del Señor');

    expect(matchesSongTitleOrLyrics(taggedSong, 'sublime gracia')).toBe(true);
    expect(matchesSongTitleOrLyrics(taggedSong, 'perdido y el me hallo')).toBe(true);
    expect(matchesSongTitleOrLyrics(taggedSong, 'me hallo')).toBe(true);
    expect(matchesSongTitleOrLyrics(taggedSong, 'John Newton')).toBe(false);
    expect(matchesSongTitleOrLyrics(taggedSong, 'adoracion')).toBe(false);
  });

  it('[UX2] transposeChordProText transpone acordes preservando directivas de sección y letras', () => {
    const raw = '{verse: Verso 1}\n[G]Sublime gracia del [C]Señor\nQue a un [Em]infeliz [D]salvó';
    const transposed = transposeChordProText(raw, 2);

    expect(transposed).toContain('{verse: Verso 1}');
    expect(transposed).toContain('[A]Sublime gracia del [D]Señor');
    expect(transposed).toContain('Que a un [F#m]infeliz [E]salvó');
  });

  it('[UX3] MobileBottomNav y SongEditorModal mantienen navegación desplazable, sin Artista/Destino y pie en una fila', () => {
    const navHtml = renderToStaticMarkup(
      React.createElement(MobileBottomNav, {
        activeTab: 'catalog',
        onSelectTab: vi.fn(),
        onOpenSedeSelector: vi.fn(),
        activeSedeName: 'General'
      })
    );

    expect(navHtml).not.toContain('fixed bottom-0');
    expect(navHtml).toContain('Canciones');
    expect(navHtml).toContain('Repertorios');

    const editorHtml = renderToStaticMarkup(
      React.createElement(SongEditorModal, {
        isOpen: true,
        initialSong: baseSong,
        activeSedeId: 'sede-palestina',
        activeSedeLabel: 'Sede Palestina (Caldas)',
        isMusicianMode: true,
        hasLocalOverride: true,
        onClose: vi.fn(),
        onSave: vi.fn(),
        onDeleteSong: vi.fn(),
        onRestoreOverride: vi.fn()
      })
    );

    expect(editorHtml).not.toContain('Artista o Autor');
    expect(editorHtml).not.toContain('Destino:');
    expect(editorHtml).not.toContain('Modo Músico (Letra con Acordes)');
    expect(editorHtml).not.toContain('Editar: Sublime Gracia');
    expect(editorHtml).toContain('aria-label="Cerrar editor"');
    expect(editorHtml).toContain('Vista Previa');
    expect(editorHtml).toContain('Tono en esta Sede *');
    expect(editorHtml).toContain('aria-label="Bajar medio tono"');
    expect(editorHtml).toContain('aria-label="Subir medio tono"');
    expect(editorHtml).toContain('flex-nowrap');
    expect(editorHtml).toContain('Restaurar general');
    expect(editorHtml).toContain('Guardar');

    const sedeExclusiveSong: BaseSong = {
      ...baseSong,
      id: 'canto-palestina',
      sedeId: 'sede-palestina',
      syncSource: 'local'
    };
    const exclusiveEditorHtml = renderToStaticMarkup(
      React.createElement(SongEditorModal, {
        isOpen: true,
        initialSong: sedeExclusiveSong,
        activeSedeId: 'sede-palestina',
        isMusicianMode: true,
        hasLocalOverride: true,
        onClose: vi.fn(),
        onSave: vi.fn(),
        onDeleteSong: vi.fn(),
        onRestoreOverride: vi.fn()
      })
    );
    expect(exclusiveEditorHtml).not.toContain('Restaurar general');
    expect(exclusiveEditorHtml).toContain('aria-label="Eliminar canción"');
  });

  it('[UX4] isSongVisibleInSede aisla canciones exclusivas de sede y migrateLegacySedeSongs corrige canciones previas', async () => {
    const sedeOnlySong: BaseSong = {
      ...baseSong,
      id: 'cancion-prueba-palestina',
      title: 'Canción de Prueba',
      sedeId: 'sede-palestina',
      syncSource: 'local'
    };

    expect(isSongVisibleInSede(baseSong, 'general')).toBe(true);
    expect(isSongVisibleInSede(baseSong, 'sede-palestina')).toBe(true);
    expect(isSongVisibleInSede(sedeOnlySong, 'sede-palestina')).toBe(true);
    expect(isSongVisibleInSede(sedeOnlySong, 'general')).toBe(false);
    expect(isSongVisibleInSede(sedeOnlySong, 'sede-central')).toBe(false);

    const legacyOrphanSong: BaseSong = {
      ...baseSong,
      id: 'prueba-antigua',
      title: 'Prueba Antigua',
      syncSource: 'local'
    };
    const legacyOverride: SedeSongOverride = {
      id: 'prueba-antigua_sede-palestina',
      baseSongId: 'prueba-antigua',
      sedeId: 'sede-palestina',
      customKey: 'A',
      localNotes: 'Nota Palestina',
      updatedAt: '2026-11-11T10:00:00.000Z',
      syncSource: 'local'
    };

    vi.spyOn(db.songs, 'count').mockResolvedValue(1);
    vi.spyOn(db.overrides, 'count').mockResolvedValue(1);
    vi.spyOn(db.songs, 'toArray').mockResolvedValue([legacyOrphanSong]);
    vi.spyOn(db.overrides, 'toArray').mockResolvedValue([legacyOverride]);
    const putSongSpy = vi.spyOn(db.songs, 'put').mockResolvedValue('prueba-antigua');
    const deleteOverrideSpy = vi.spyOn(db.overrides, 'delete').mockResolvedValue();

    await initializeDatabase();

    expect(putSongSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'prueba-antigua',
        sedeId: 'sede-palestina',
        originalKey: 'A',
        notes: 'Nota Palestina'
      })
    );
    expect(deleteOverrideSpy).toHaveBeenCalledWith('prueba-antigua_sede-palestina');
  });

  it('[UX5] oculta indicador Online/Offline, oculta trigger superior de sede y oculta editar/crear sin sesión conservando repertorios', () => {
    // 1. Sin conexión visible ni botón superior cuando hideTriggerButton = true
    const hiddenSelectorHtml = renderToStaticMarkup(
      React.createElement(SedeSelector, {
        activeSedeId: 'sede-palestina',
        onSelectSede: vi.fn(),
        isOnline: true,
        hideTriggerButton: true,
        adminSession: null
      })
    );
    expect(hiddenSelectorHtml).toBe('');
    expect(hiddenSelectorHtml).not.toContain('Online');
    expect(hiddenSelectorHtml).not.toContain('Offline');

    const visibleSelectorHtml = renderToStaticMarkup(
      React.createElement(SedeSelector, {
        activeSedeId: 'sede-palestina',
        onSelectSede: vi.fn(),
        isOnline: false,
        hideTriggerButton: false,
        adminSession: null
      })
    );
    expect(visibleSelectorHtml).not.toContain('Online');
    expect(visibleSelectorHtml).not.toContain('Offline');
    expect(visibleSelectorHtml).not.toContain('Registrar nueva Sede');

    // 2. Sin sesión autorizada, ReaderView y MusicianView no muestran botones de edición
    expect(canSessionEditSede(null, 'sede-palestina')).toBe(false);
    expect(canSessionEditSede(null, 'general')).toBe(false);

    const displaySong: DisplaySong = {
      id: baseSong.id,
      title: baseSong.title,
      key: baseSong.originalKey,
      sections: baseSong.sections,
      isLocalOverride: false
    };

    const readerNoAuth = renderToStaticMarkup(
      React.createElement(ReaderView, {
        song: displaySong,
        onEnterProjection: vi.fn(),
        onEditSong: undefined
      })
    );
    expect(readerNoAuth).not.toContain('aria-label="Editar letra de la canción"');

    const musicianNoAuth = renderToStaticMarkup(
      React.createElement(MusicianView, {
        song: displaySong,
        onEnterProjection: vi.fn(),
        onEditFullSong: undefined
      })
    );
    expect(musicianNoAuth).not.toContain('aria-label="Editar canción"');

    // 3. Repertorios locales permanecen disponibles sin sesión
    const setlistHtml = renderToStaticMarkup(
      React.createElement(SetlistManager, {
        songs: [baseSong],
        activeSedeId: 'sede-palestina',
        savedSetlists: [],
        isMusicianMode: false,
        onSelectSong: vi.fn(),
        onSetlistsUpdated: vi.fn()
      })
    );
    expect(setlistHtml).toContain('Repertorios');
    expect(setlistHtml).toContain('Nuevo');
  });

  it('[UX6] ordena y agrupa canciones alfabéticamente (con tildes y signos) y reemplaza el select de repertorios por buscador', () => {
    expect(getSongInitialLetter('¡Cuán Grande Es Él!')).toBe('C');
    expect(getSongInitialLetter('Ángel del Señor')).toBe('A');
    expect(getSongInitialLetter('10000 Razones')).toBe('#');

    const songsSample: BaseSong[] = [
      { ...baseSong, id: 's1', title: 'Sublime Gracia' },
      { ...baseSong, id: 's2', title: '¡Alabadle!' },
      { ...baseSong, id: 's3', title: 'Ángel de Luz' },
      { ...baseSong, id: 's4', title: 'Cuan Bello es el Señor' },
      { ...baseSong, id: 's5', title: '100 Razones' }
    ];

    const grouped = groupEntriesAlphabetically(songsSample, s => s.title);
    expect(grouped.map(g => g.letter)).toEqual(['A', 'C', 'S', '#']);
    expect(grouped[0].items.map(s => s.title)).toEqual(['¡Alabadle!', 'Ángel de Luz']);

    const { matches, totalMatching } = filterAndSortSongsByTitle(songsSample, 'cuan', 2);
    expect(totalMatching).toBe(1);
    expect(matches[0].id).toBe('s4');

    const { matches: limited, totalMatching: totalAll } = filterAndSortSongsByTitle(songsSample, '', 3);
    expect(totalAll).toBe(5);
    expect(limited).toHaveLength(3);

    // SetlistManager usa buscador por título y botón Agregar sin <select>
    const setlist: Setlist = {
      id: 'setlist_buscador',
      name: 'Culto Prueba',
      date: '2026-11-26',
      sedeId: 'general',
      items: [],
      createdAt: '2026-11-26T15:00:00.000Z'
    };

    const setlistHtml = renderToStaticMarkup(
      React.createElement(SetlistManager, {
        songs: songsSample,
        activeSedeId: 'general',
        savedSetlists: [setlist],
        isMusicianMode: true,
        onSelectSong: vi.fn(),
        onSetlistsUpdated: vi.fn()
      })
    );

    expect(setlistHtml).toContain('Buscar por título entre 5 canción(es)...');
    expect(setlistHtml).toContain('Cuan Bello es el Señor');
    expect(setlistHtml).toContain('¡Alabadle!');
    expect(setlistHtml).not.toContain('<select');

    const manySongs: BaseSong[] = Array.from({ length: 35 }, (_, idx) => ({
      ...baseSong,
      id: `song-${idx + 1}`,
      title: `Canto ${String(idx + 1).padStart(2, '0')}`
    }));
    const manyHtml = renderToStaticMarkup(
      React.createElement(SetlistManager, {
        songs: manySongs,
        activeSedeId: 'general',
        savedSetlists: [setlist],
        isMusicianMode: false,
        onSelectSong: vi.fn(),
        onSetlistsUpdated: vi.fn()
      })
    );
    expect(manyHtml).toContain('Mostrando 30 de 35 canciones');
  });

  it('[UX7] buildIndexedCatalog precalcula índice veloz, prioriza título y pagina de 30 en 30 canciones', () => {
    const bulkSongs: BaseSong[] = Array.from({ length: 75 }, (_, idx) => ({
      ...baseSong,
      id: `himno-${idx + 1}`,
      title: idx < 40 ? `Alabanza ${String(idx + 1).padStart(2, '0')}` : `Canto ${String(idx + 1).padStart(2, '0')}`,
      sections: [
        {
          id: 'v1',
          type: 'verse',
          label: 'Verso 1',
          lines: idx === 70 ? ['[G]Esta estrofa menciona misericordia eterna'] : ['[C]Letra normal de prueba']
        }
      ]
    }));

    const indexed = buildIndexedCatalog(bulkSongs, 'general', [], 'Catálogo General');
    expect(indexed).toHaveLength(75);
    expect(indexed[0].letter).toBe('A');
    expect(indexed[70].normLyrics).toContain('misericordia');

    // Filtrado sobre letra precalculada sin corchetes
    const lyricsHits = filterIndexedCatalog(indexed, 'misericordia');
    expect(lyricsHits).toHaveLength(1);
    expect(lyricsHits[0].song.id).toBe('himno-71');

    // Paginación estricta de 30 en 30 (75 canciones => 3 páginas: 30, 30, 15)
    expect(CATALOG_PAGE_SIZE).toBe(30);
    const p1 = paginateCatalogItems(indexed, 1, CATALOG_PAGE_SIZE);
    expect(p1.pageItems).toHaveLength(30);
    expect(p1.totalPages).toBe(3);
    expect(p1.startIndex).toBe(0);
    expect(p1.endIndex).toBe(30);

    const p3 = paginateCatalogItems(indexed, 3, CATALOG_PAGE_SIZE);
    expect(p3.pageItems).toHaveLength(15);
    expect(p3.currentPage).toBe(3);

    // Página donde empieza la letra 'C' (índice 40 => página 2)
    const firstCIndex = indexed.findIndex(item => item.letter === 'C');
    expect(Math.floor(firstCIndex / CATALOG_PAGE_SIZE) + 1).toBe(2);
  });

  it('[UX8-iOS] ConfirmDialogModal renderiza diálogos seguros sin confirm/alert y ProjectionView soporta Safari iOS sin Fullscreen API', () => {
    const confirmHtml = renderToStaticMarkup(
      React.createElement(ConfirmDialogModal, {
        isOpen: true,
        title: 'Eliminar repertorio',
        message: '¿Eliminar "Culto Domingo" de este dispositivo?',
        confirmLabel: 'Eliminar',
        variant: 'danger',
        onCancel: vi.fn(),
        onConfirm: vi.fn()
      })
    );
    expect(confirmHtml).toContain('role="dialog"');
    expect(confirmHtml).toContain('Eliminar repertorio');
    expect(confirmHtml).toContain('Cancelar');
    expect(confirmHtml).toContain('Eliminar');

    // ProjectionView en entorno iOS/SSR donde document.documentElement.requestFullscreen no existe
    const projectionHtml = renderToStaticMarkup(
      React.createElement(ProjectionView, {
        song: {
          id: baseSong.id,
          title: baseSong.title,
          key: baseSong.originalKey,
          sections: baseSong.sections,
          isLocalOverride: false
        },
        onClose: vi.fn()
      })
    );
    expect(projectionHtml).toContain('h-[100dvh]');
    expect(projectionHtml).not.toContain('title="Pantalla Completa"');
  });
});
