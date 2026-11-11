import { useState, useEffect, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BookOpen,
  ListMusic,
  Search,
  Sparkles,
  Share2,
  Plus,
  Music,
  AlertTriangle,
  Church,
  X
} from 'lucide-react';
import { db, initializeDatabase } from './db';
import { BaseSong, SedeProfile, SyncStatus } from './types';
import { resolveSongForDisplay, isSongVisibleInSede } from './services/songResolver';
import { decompressSetlist } from './services/urlSharing';
import { checkAndRequestStoragePersistence } from './services/backupService';
import {
  getSongOpeningLine,
  matchesSongTitleOrLyrics
} from './services/songEditorHelper';
import {
  getLastSyncAt,
  getStoredSedes,
  isSedeSynced,
  syncCatalogAndSede,
  syncSedeFromGitHub
} from './services/gitSyncService';
import { SedeSelector, SEDES_LIST } from './components/SedeSelector';
import { MusicianView } from './components/MusicianView';
import { ProjectionView } from './components/ProjectionView';
import { SetlistManager, SetlistSelectionContext } from './components/SetlistManager';
import { SetlistNavProps } from './components/SetlistNavControls';
import { CorrectionModal } from './components/CorrectionModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import { SongEditorModal } from './components/SongEditorModal';
import { ReaderView } from './components/ReaderView';
import { BackupModal } from './components/BackupModal';

const ACTIVE_SEDE_STORAGE_KEY = 'app_lyrics_active_sede';

export function App() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'setlists'>('catalog');
  const [activeSedeId, setActiveSedeId] = useState<string>(() => {
    return localStorage.getItem(ACTIVE_SEDE_STORAGE_KEY) || 'general';
  });
  const [songContextSedeId, setSongContextSedeId] = useState<string | null>(null);
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const [selectedSetlistId, setSelectedSetlistId] = useState<string | null>(null);
  const [setlistNavContext, setSetlistNavContext] = useState<SetlistSelectionContext | null>(null);
  const [selectedSongId, setSelectedSongId] = useState<string>('sublime-gracia');
  const [isExplicitSongSelection, setIsExplicitSongSelection] = useState<boolean>(false);
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
  const [isProjectionMode, setIsProjectionMode] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [correctionSong, setCorrectionSong] = useState<BaseSong | null>(null);
  const [importNotification, setImportNotification] = useState<string | null>(null);
  const [isSedeSelectorOpen, setIsSedeSelectorOpen] = useState<boolean>(false);
  const [sedeRequiredPrompt, setSedeRequiredPrompt] = useState<'edit' | 'create' | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [songToEdit, setSongToEdit] = useState<BaseSong | null>(null);
  const [editorOriginalTitle, setEditorOriginalTitle] = useState<string | undefined>(undefined);
  const [editorInitialNotes, setEditorInitialNotes] = useState<string | undefined>(undefined);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState<boolean>(false);
  const [sedesList, setSedesList] = useState<SedeProfile[]>(() => getStoredSedes(SEDES_LIST));
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(() => getLastSyncAt());
  const [isMusicianMode, setIsMusicianMode] = useState<boolean>(() => {
    return localStorage.getItem('app_lyrics_musician_mode') === 'true';
  });

  const activeSedeRef = useRef(activeSedeId);
  activeSedeRef.current = activeSedeId;
  const importTimerRef = useRef<number | null>(null);

  const toggleMusicianMode = () => {
    const nextMode = !isMusicianMode;
    setIsMusicianMode(nextMode);
    localStorage.setItem('app_lyrics_musician_mode', nextMode.toString());
  };

  const runSync = useCallback(async (targetSedeId: string, force: boolean = false) => {
    if (!navigator.onLine) {
      setSyncStatus('offline');
      return;
    }

    setSyncStatus('syncing');
    const result = await syncCatalogAndSede(targetSedeId, { force });
    if (result.sedes && result.sedes.length > 0) {
      setSedesList(result.sedes);
    } else {
      setSedesList(getStoredSedes(SEDES_LIST));
    }
    setLastSyncAt(getLastSyncAt());
    setSyncStatus(result.status);
  }, []);

  const handleSelectSede = useCallback(async (nextSedeId: string) => {
    setActiveSedeId(nextSedeId);
    setSongContextSedeId(null);
    setSelectedItemKey(null);
    setSetlistNavContext(null);
    localStorage.setItem(ACTIVE_SEDE_STORAGE_KEY, nextSedeId);
    setSedesList(getStoredSedes(SEDES_LIST));

    const currentSong = await db.songs.get(selectedSongId);
    if (currentSong && !isSongVisibleInSede(currentSong, nextSedeId)) {
      const allDbSongs = await db.songs.toArray();
      const firstVisible = allDbSongs.find(s => isSongVisibleInSede(s, nextSedeId));
      setIsExplicitSongSelection(false);
      setSelectedSongId(firstVisible?.id || 'sublime-gracia');
      setMobileView('list');
    }

    if (nextSedeId !== 'general' && navigator.onLine) {
      setSyncStatus('syncing');
      const result = await syncSedeFromGitHub(nextSedeId, { force: true });
      setLastSyncAt(getLastSyncAt());
      setSyncStatus(result.status);
    }
  }, [selectedSongId]);

  // Inicializar base de datos IndexedDB en primer montaje y sincronizar desde GitHub
  useEffect(() => {
    initializeDatabase()
      .then(() => {
        if (navigator.onLine) {
          return runSync(activeSedeRef.current);
        }
      })
      .catch(err => console.error('Error al iniciar BD local:', err));

    checkAndRequestStoragePersistence().catch(err => console.warn('Error al verificar persistencia:', err));

    const handleOnline = () => {
      setIsOnline(true);
      runSync(activeSedeRef.current).catch(err => console.warn('Error al re-sincronizar:', err));
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Detección e importación de repertorios compartidos vía URL hash (#repertorio=...)
    const checkSharedUrl = async () => {
      if (window.location.hash.startsWith('#repertorio=')) {
        const compressed = window.location.hash.replace('#repertorio=', '');
        const importedSetlist = decompressSetlist(compressed);
        if (importedSetlist) {
          await db.setlists.put(importedSetlist);
          setActiveTab('setlists');

          let notification = `¡Repertorio "${importedSetlist.name}" importado exitosamente!`;
          if (navigator.onLine) {
            const syncRes = await syncCatalogAndSede(importedSetlist.sedeId || 'general', {
              force: true
            });
            if (syncRes.sedes && syncRes.sedes.length > 0) {
              setSedesList(syncRes.sedes);
            }
            if (syncRes.status === 'synced') {
              setLastSyncAt(getLastSyncAt());
              notification = `¡Repertorio "${importedSetlist.name}" importado y sincronizado!`;
            }
          } else if (importedSetlist.sedeId && importedSetlist.sedeId !== 'general') {
            notification = `¡Repertorio "${importedSetlist.name}" importado! (Sin conexión: usando catálogo local)`;
          }

          setImportNotification(notification);
          window.history.replaceState(null, '', window.location.pathname);
          if (importTimerRef.current) {
            clearTimeout(importTimerRef.current);
          }
          importTimerRef.current = window.setTimeout(() => setImportNotification(null), 5000);
        }
      }
    };

    checkSharedUrl();
    window.addEventListener('hashchange', checkSharedUrl);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('hashchange', checkSharedUrl);
      if (importTimerRef.current) {
        clearTimeout(importTimerRef.current);
      }
    };
  }, [runSync]);

  // Consultas reactivas a IndexedDB con Dexie
  const songs = useLiveQuery(() => db.songs.toArray()) || [];
  const overrides = useLiveQuery(() => db.overrides.toArray()) || [];
  const setlists = useLiveQuery(() => db.setlists.toArray()) || [];

  const currentSedeProfile = sedesList.find(s => s.id === activeSedeId) || {
    name: activeSedeId === 'general' ? 'Catálogo General' : activeSedeId,
    shortName: activeSedeId === 'general' ? 'General' : activeSedeId.replace(/^sede-/, '')
  };

  // Filtrado por visibilidad de sede y búsqueda por título o contenido limpio de letra
  const visibleSongs = songs.filter(song => isSongVisibleInSede(song, activeSedeId));
  const catalogEntries = visibleSongs
    .map(song => ({
      song,
      resolvedItem: resolveSongForDisplay(song, activeSedeId, overrides, {
        sedeLabel: currentSedeProfile.name
      })
    }))
    .filter(({ song, resolvedItem }) =>
      matchesSongTitleOrLyrics(song, searchQuery, resolvedItem.sections, resolvedItem.title)
    );

  // Resolución segura sin sustituciones silenciosas cuando una canción de repertorio falta offline
  const effectiveSedeId = songContextSedeId || activeSedeId;
  const effectiveSedeProfile = sedesList.find(s => s.id === effectiveSedeId);
  const effectiveSongs = songs.filter(song => isSongVisibleInSede(song, effectiveSedeId));
  const foundSelectedSong = effectiveSongs.find(s => s.id === selectedSongId);
  const isMissingRequestedSong = Boolean(isExplicitSongSelection && songs.length > 0 && !foundSelectedSong);
  const activeBaseSong = foundSelectedSong || (isExplicitSongSelection ? undefined : visibleSongs[0]);

  const activeDisplaySong = activeBaseSong
    ? resolveSongForDisplay(activeBaseSong, activeSedeId, overrides, {
        expectedSedeId: effectiveSedeId,
        isSedeSynced: isSedeSynced(effectiveSedeId),
        sedeLabel: effectiveSedeProfile?.name || effectiveSedeId
      })
    : null;

  const activeNavSetlist = setlistNavContext
    ? setlists.find(s => s.id === setlistNavContext.setlistId)
    : undefined;

  const navigateToSetlistIndex = (targetIndex: number) => {
    if (!activeNavSetlist) return;
    const targetItem = activeNavSetlist.items[targetIndex];
    if (!targetItem) return;
    setSelectedSongId(targetItem.songId);
    setIsExplicitSongSelection(true);
    setSongContextSedeId(activeNavSetlist.sedeId || null);
    setSelectedItemKey(targetItem.key || null);
    setSetlistNavContext({ setlistId: activeNavSetlist.id, itemIndex: targetIndex });
    setMobileView('detail');
  };

  const setlistNav: SetlistNavProps | undefined =
    activeNavSetlist &&
    setlistNavContext &&
    setlistNavContext.itemIndex >= 0 &&
    setlistNavContext.itemIndex < activeNavSetlist.items.length
      ? {
          canPrev: setlistNavContext.itemIndex > 0,
          canNext: setlistNavContext.itemIndex < activeNavSetlist.items.length - 1,
          onPrev: () => navigateToSetlistIndex(setlistNavContext.itemIndex - 1),
          onNext: () => navigateToSetlistIndex(setlistNavContext.itemIndex + 1),
          onReturnToSetlist: () => {
            setSelectedSetlistId(activeNavSetlist.id);
            setActiveTab('setlists');
          }
        }
      : undefined;

  const openEditorForActiveSong = () => {
    if (!activeBaseSong || !activeDisplaySong) return;

    if (effectiveSedeId === 'general') {
      setSedeRequiredPrompt('edit');
      return;
    }

    const editableSong: BaseSong = {
      id: activeBaseSong.id,
      title: activeDisplaySong.title,
      artist: activeDisplaySong.artist,
      originalKey: activeDisplaySong.key,
      bpm: activeDisplaySong.bpm,
      timeSignature: activeDisplaySong.timeSignature,
      sections: activeDisplaySong.sections,
      tags: activeBaseSong.tags,
      sedeId: activeBaseSong.sedeId,
      notes: activeDisplaySong.notes,
      updatedAt: activeBaseSong.updatedAt,
      syncSource: activeBaseSong.syncSource
    };

    setSongToEdit(editableSong);
    setEditorOriginalTitle(activeBaseSong.title);
    setEditorInitialNotes(activeDisplaySong.notes);
    setIsEditorOpen(true);
  };

  const openCreateSongEditor = () => {
    if (activeSedeId === 'general') {
      setSedeRequiredPrompt('create');
      return;
    }

    setSongToEdit(null);
    setEditorOriginalTitle(undefined);
    setEditorInitialNotes(undefined);
    setIsEditorOpen(true);
  };

  const handleRestoreOverride = async (songId: string) => {
    if (!effectiveSedeId || effectiveSedeId === 'general') return;
    await db.overrides.delete(`${songId}_${effectiveSedeId}`);
  };

  const handleDeleteSong = async (songId: string) => {
    const existingSong = await db.songs.get(songId);
    if (existingSong && existingSong.syncSource !== 'local') {
      return;
    }

    await db.songs.delete(songId);
    const relatedOverrides = overrides.filter(o => o.baseSongId === songId);
    if (relatedOverrides.length > 0) {
      await db.overrides.bulkDelete(relatedOverrides.map(o => o.id));
    }
    setIsExplicitSongSelection(false);
    setSongContextSedeId(null);
    setSelectedItemKey(null);
    setSetlistNavContext(null);
    setSelectedSongId(visibleSongs.find(s => s.id !== songId)?.id || 'sublime-gracia');
    setMobileView('list');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Barra de Notificación de Importación */}
      {importNotification && (
        <div className="bg-emerald-600 text-white text-xs sm:text-sm font-semibold py-2.5 px-4 text-center shadow-lg flex items-center justify-center gap-2">
          <Share2 className="w-4 h-4" />
          <span>{importNotification}</span>
        </div>
      )}

      {/* Barra de Navegación Superior (Desplazable para maximizar área móvil) */}
      <header className="relative z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Logo y Nombre */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-950 shrink-0">
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <span className="font-extrabold text-sm sm:text-lg text-white tracking-tight flex items-center gap-1.5">
                App Lyrics
              </span>
              <span className="hidden sm:block text-[10px] text-slate-400 font-medium">
                Alabanza & Medios Audiovisuales
              </span>
            </div>
          </div>

          {/* Navegación por pestañas (Desktop) y selector de sede */}
          <div className="flex items-center gap-2 sm:gap-4">
            <nav className="hidden lg:flex items-center p-1 bg-slate-900 border border-slate-800 rounded-xl">
              <button
                onClick={() => {
                  setActiveTab('catalog');
                  setSongContextSedeId(null);
                  setSelectedItemKey(null);
                  setSetlistNavContext(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeTab === 'catalog'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Cancionero</span>
              </button>

              <button
                onClick={() => setActiveTab('setlists')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activeTab === 'setlists'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ListMusic className="w-3.5 h-3.5" />
                <span>Repertorios</span>
              </button>
            </nav>

            {/* Selector de Sede */}
            <SedeSelector
              activeSedeId={activeSedeId}
              onSelectSede={handleSelectSede}
              isOnline={isOnline}
              isOpenControlled={isSedeSelectorOpen ? true : undefined}
              onCloseControlled={() => setIsSedeSelectorOpen(false)}
              sedesList={sedesList}
              syncStatus={syncStatus}
              lastSyncAt={lastSyncAt}
              onManualSync={() => runSync(activeSedeId, true)}
            />

            {/* Conmutador Global Modo Músico / Modo Lector */}
            <button
              onClick={toggleMusicianMode}
              title={isMusicianMode ? 'Desactivar modo músico (Ver solo letra lírica)' : 'Activar modo músico (Ver acordes y teoría musical)'}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all shrink-0 ${
                isMusicianMode
                  ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500 shadow-sm shadow-emerald-950'
                  : 'bg-slate-900/90 text-slate-400 border-slate-700 hover:text-white'
              }`}
            >
              <Music className={`w-3.5 h-3.5 ${isMusicianMode ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span className="hidden sm:inline">
                {isMusicianMode ? 'Modo Músico' : 'Modo Lector'}
              </span>
              <span className="sm:hidden">
                {isMusicianMode ? 'Músico' : 'Lector'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6">
        {activeTab === 'catalog' ? (
          <div className="lg:grid lg:grid-cols-12 lg:gap-6">
            {/* Columna Izquierda: Catálogo y Búsqueda */}
            <div className={`space-y-3 sm:space-y-4 lg:col-span-4 ${
              mobileView === 'detail' ? 'hidden lg:block' : 'block'
            }`}>
              {/* Barra de Búsqueda y Botón Nueva Canción */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar por título o parte de la letra..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 sm:py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                <button
                  onClick={openCreateSongEditor}
                  title="Crear nueva canción"
                  className="flex items-center gap-1 px-3 py-2 sm:py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shrink-0 shadow-sm transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Nueva</span>
                </button>
              </div>

              {/* Lista de Canciones */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-1.5 sm:p-2 space-y-1 lg:max-h-[calc(100vh-250px)] lg:overflow-y-auto">
                {catalogEntries.map(({ song, resolvedItem }) => {
                  const hasLocalOverride = resolvedItem.isLocalOverride;
                  const isSedeExclusive = Boolean(song.sedeId && song.sedeId !== 'general');
                  const showSedeBadge = hasLocalOverride || isSedeExclusive;
                  const openingLine = getSongOpeningLine(resolvedItem.sections);
                  const isSelected = activeBaseSong ? song.id === activeBaseSong.id : false;

                  return (
                    <div
                      key={song.id}
                      onClick={() => {
                        setSelectedSongId(song.id);
                        setIsExplicitSongSelection(true);
                        setSongContextSedeId(null);
                        setSelectedItemKey(null);
                        setSetlistNavContext(null);
                        setMobileView('detail');
                      }}
                      className={`group p-3 rounded-xl cursor-pointer transition-all flex items-center justify-between active:scale-[0.99] ${
                        isSelected
                          ? 'bg-slate-800 border border-emerald-600/40 text-white shadow-md'
                          : 'hover:bg-slate-800/80 text-slate-300 hover:text-white'
                      }`}
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-sm font-semibold truncate">{song.title}</h4>
                          {showSedeBadge && (
                            <span
                              title="Versión o canción exclusiva de esta sede"
                              className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"
                            />
                          )}
                        </div>
                        <p className="text-xs text-slate-400 truncate mt-0.5">
                          {openingLine || 'Sin letra registrada'}
                        </p>
                      </div>

                      {(isMusicianMode || showSedeBadge) && (
                        <div className="flex items-center gap-1 shrink-0">
                          {isMusicianMode && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-bold">
                              {resolvedItem.key}
                            </span>
                          )}

                          {showSedeBadge && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-medium">
                              Sede
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {catalogEntries.length === 0 && (
                  <div className="py-8 text-center text-xs text-slate-500">
                    No se encontraron canciones que coincidan.
                  </div>
                )}
              </div>

              {/* Tarjeta Informativa de la Arquitectura */}
              <div className="p-3 sm:p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 text-xs text-slate-400 space-y-1 hidden sm:block">
                <div className="flex items-center gap-1.5 font-semibold text-slate-300">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Arquitectura de Variantes Activa</span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Sede actual: <strong className="text-emerald-400">{currentSedeProfile.name}</strong>. Las personalizaciones en el atril se guardan localmente para tu sede sin modificar el catálogo general.
                </p>
              </div>
            </div>

            {/* Columna Derecha: Vista de Canción */}
            <div className={`lg:col-span-8 ${
              mobileView === 'list' ? 'hidden lg:block' : 'block'
            }`}>
              {isMissingRequestedSong ? (
                <div className="max-w-xl mx-auto mt-6 p-6 rounded-2xl bg-amber-950/30 border border-amber-800/60 text-center space-y-3">
                  <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
                  <h3 className="text-base font-bold text-white">
                    Canción aún no descargada en este dispositivo
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    El repertorio solicita la canción <code className="text-amber-300">{selectedSongId}</code>, pero todavía no existe en tu catálogo local. Conéctate a internet y sincroniza el cancionero.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    {setlistNav && (
                      <button
                        onClick={setlistNav.onReturnToSetlist}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors"
                      >
                        Volver al repertorio
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setIsExplicitSongSelection(false);
                        setSongContextSedeId(null);
                        setSelectedItemKey(null);
                        setSetlistNavContext(null);
                        setMobileView('list');
                      }}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors"
                    >
                      Volver al cancionero
                    </button>
                    {isOnline && (
                      <button
                        onClick={() => runSync(activeSedeId, true)}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors"
                      >
                        Actualizar cancionero ahora
                      </button>
                    )}
                  </div>
                </div>
              ) : activeDisplaySong ? (
                isMusicianMode ? (
                  <MusicianView
                    song={activeDisplaySong}
                    expectedKey={selectedItemKey || undefined}
                    setlistNav={setlistNav}
                    onEnterProjection={() => setIsProjectionMode(true)}
                    onBackToCatalog={() => {
                      setSetlistNavContext(null);
                      setMobileView('list');
                    }}
                    onEditFullSong={openEditorForActiveSong}
                    onReportCorrection={activeBaseSong ? () => setCorrectionSong(activeBaseSong) : undefined}
                  />
                ) : (
                  <ReaderView
                    song={activeDisplaySong}
                    setlistNav={setlistNav}
                    onEnterProjection={() => setIsProjectionMode(true)}
                    onBackToCatalog={() => {
                      setSetlistNavContext(null);
                      setMobileView('list');
                    }}
                    onEditSong={openEditorForActiveSong}
                    onReportCorrection={activeBaseSong ? () => setCorrectionSong(activeBaseSong) : undefined}
                  />
                )
              ) : (
                <div className="text-center py-20 text-slate-500 text-sm">
                  {isMusicianMode
                    ? 'Selecciona una canción del catálogo para ver sus acordes y letra.'
                    : 'Selecciona una canción del catálogo para leer la letra.'}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Vista de Repertorios */
          <SetlistManager
            songs={songs}
            overrides={overrides}
            activeSedeId={activeSedeId}
            sedesList={sedesList}
            savedSetlists={setlists}
            isMusicianMode={isMusicianMode}
            selectedSetlistId={selectedSetlistId}
            onSelectSetlistId={setSelectedSetlistId}
            onOpenBackup={() => setIsBackupModalOpen(true)}
            onSelectSong={(songId, sourceSedeId, itemKey, setlistContext) => {
              setSelectedSongId(songId);
              setIsExplicitSongSelection(true);
              setSongContextSedeId(sourceSedeId || null);
              setSelectedItemKey(itemKey || null);
              if (setlistContext) {
                setSelectedSetlistId(setlistContext.setlistId);
                setSetlistNavContext(setlistContext);
              } else {
                setSetlistNavContext(null);
              }
              setActiveTab('catalog');
              setMobileView('detail');
            }}
            onSetlistsUpdated={() => {}}
          />
        )}
      </main>

      {/* Barra de Navegación Inferior Nativa para Móviles */}
      <MobileBottomNav
        activeTab={activeTab}
        onSelectTab={tab => {
          setActiveTab(tab);
          if (tab === 'catalog') {
            setSongContextSedeId(null);
            setSelectedItemKey(null);
            setSetlistNavContext(null);
            setMobileView('list');
          }
        }}
        onOpenSedeSelector={() => setIsSedeSelectorOpen(true)}
        activeSedeName={currentSedeProfile.shortName || currentSedeProfile.name.replace('Catálogo ', '')}
      />

      {/* Modo Proyección (Pantalla Completa) */}
      {isProjectionMode && activeDisplaySong && (
        <ProjectionView
          song={activeDisplaySong}
          onClose={() => setIsProjectionMode(false)}
        />
      )}

      {/* Modal de Corrección de Letra General */}
      {correctionSong && (
        <CorrectionModal
          song={correctionSong}
          isOpen={!!correctionSong}
          onClose={() => setCorrectionSong(null)}
        />
      )}

      {/* Modal de Edición y Creación de Canciones */}
      {isEditorOpen && (
        <SongEditorModal
          isOpen={isEditorOpen}
          initialSong={songToEdit}
          originalSongTitle={editorOriginalTitle}
          initialNotes={editorInitialNotes}
          hasLocalOverride={Boolean(activeDisplaySong?.isLocalOverride && songToEdit)}
          activeSedeId={effectiveSedeId}
          activeSedeLabel={effectiveSedeProfile?.name}
          isMusicianMode={isMusicianMode}
          existingSongIds={songs.map(s => s.id)}
          onClose={() => setIsEditorOpen(false)}
          onSave={savedSong => {
            setSelectedSongId(savedSong.id);
            setIsExplicitSongSelection(true);
            setSelectedItemKey(null);
            setMobileView('detail');
          }}
          onDeleteSong={handleDeleteSong}
          onRestoreOverride={handleRestoreOverride}
        />
      )}

      {/* Modal de Copia de Seguridad y Datos */}
      {isBackupModalOpen && (
        <BackupModal
          isOpen={isBackupModalOpen}
          onClose={() => setIsBackupModalOpen(false)}
          onDataRestored={() => {}}
        />
      )}

      {/* Aviso Guía: El Catálogo General no se edita directamente sin elegir sede */}
      {sedeRequiredPrompt && (
        <div
          onClick={() => setSedeRequiredPrompt(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-950/60 border border-amber-700/60 text-amber-400">
                  <Church className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">
                  Selecciona una iglesia para continuar
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSedeRequiredPrompt(null)}
                aria-label="Cerrar aviso"
                className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Las canciones del <strong className="text-white">Catálogo General</strong> son de solo lectura.{' '}
              {sedeRequiredPrompt === 'edit'
                ? 'Para editar letras, cambiar tonos o adaptar una canción, selecciona primero el catálogo específico de tu iglesia o sede.'
                : 'Para agregar canciones locales, selecciona primero el catálogo específico de tu iglesia o sede.'}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSedeRequiredPrompt(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Entendido
              </button>
              <button
                type="button"
                onClick={() => {
                  setSedeRequiredPrompt(null);
                  setIsSedeSelectorOpen(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors"
              >
                <Church className="w-4 h-4" />
                <span>Elegir Iglesia / Sede</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
