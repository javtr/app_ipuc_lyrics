import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  BookOpen, 
  ListMusic, 
  Search, 
  Sparkles, 
  Flag,
  Share2,
  Plus,
  HardDrive,
  Music
} from 'lucide-react';
import { db, initializeDatabase } from './db';
import { BaseSong } from './types';
import { resolveSongForDisplay } from './services/songResolver';
import { decompressSetlist } from './services/urlSharing';
import { checkAndRequestStoragePersistence } from './services/backupService';
import { SedeSelector, SEDES_LIST } from './components/SedeSelector';
import { MusicianView } from './components/MusicianView';
import { ProjectionView } from './components/ProjectionView';
import { SetlistManager } from './components/SetlistManager';
import { CorrectionModal } from './components/CorrectionModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import { SongEditorModal } from './components/SongEditorModal';
import { ReaderView } from './components/ReaderView';
import { BackupModal } from './components/BackupModal';

export function App() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'setlists'>('catalog');
  const [activeSedeId, setActiveSedeId] = useState<string>('general');
  const [selectedSongId, setSelectedSongId] = useState<string>('sublime-gracia');
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
  const [isProjectionMode, setIsProjectionMode] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [correctionSong, setCorrectionSong] = useState<BaseSong | null>(null);
  const [importNotification, setImportNotification] = useState<string | null>(null);
  const [isSedeModalOpenOnMobile, setIsSedeModalOpenOnMobile] = useState<boolean>(false);
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [songToEdit, setSongToEdit] = useState<BaseSong | null>(null);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState<boolean>(false);
  const [isMusicianMode, setIsMusicianMode] = useState<boolean>(() => {
    return localStorage.getItem('app_lyrics_musician_mode') === 'true';
  });

  const toggleMusicianMode = () => {
    const nextMode = !isMusicianMode;
    setIsMusicianMode(nextMode);
    localStorage.setItem('app_lyrics_musician_mode', nextMode.toString());
  };

  // Inicializar base de datos IndexedDB en primer montaje
  useEffect(() => {
    initializeDatabase().catch(err => console.error('Error al iniciar BD local:', err));
    checkAndRequestStoragePersistence().catch(err => console.warn('Error al verificar persistencia:', err));

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

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
          setImportNotification(`¡Repertorio "${importedSetlist.name}" importado exitosamente!`);
          window.history.replaceState(null, '', window.location.pathname);
          setTimeout(() => setImportNotification(null), 5000);
        }
      }
    };

    checkSharedUrl();
    window.addEventListener('hashchange', checkSharedUrl);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('hashchange', checkSharedUrl);
    };
  }, []);

  // Consultas reactivas a IndexedDB con Dexie
  const songs = useLiveQuery(() => db.songs.toArray()) || [];
  const overrides = useLiveQuery(() => db.overrides.toArray()) || [];
  const setlists = useLiveQuery(() => db.setlists.toArray()) || [];

  // Filtrado de canciones por búsqueda
  const filteredSongs = songs.filter(song => {
    const q = searchQuery.toLowerCase();
    return (
      song.title.toLowerCase().includes(q) ||
      (song.artist && song.artist.toLowerCase().includes(q)) ||
      (song.tags && song.tags.some(t => t.toLowerCase().includes(q)))
    );
  });

  // Canción activa resuelta según sede seleccionada
  const activeBaseSong = songs.find(s => s.id === selectedSongId) || songs[0];
  const activeDisplaySong = activeBaseSong
    ? resolveSongForDisplay(activeBaseSong, activeSedeId, overrides)
    : null;

  const currentSedeProfile = SEDES_LIST.find(s => s.id === activeSedeId) || { name: 'Catálogo', shortName: 'General' };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-16 lg:pb-0">
      {/* Barra de Notificación de Importación */}
      {importNotification && (
        <div className="bg-emerald-600 text-white text-xs sm:text-sm font-semibold py-2.5 px-4 text-center shadow-lg flex items-center justify-center gap-2">
          <Share2 className="w-4 h-4" />
          <span>{importNotification}</span>
        </div>
      )}

      {/* Barra de Navegación Superior */}
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
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
                onClick={() => setActiveTab('catalog')}
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
              onSelectSede={setActiveSedeId}
              isOnline={isOnline}
              isOpenControlled={isSedeModalOpenOnMobile ? true : undefined}
              onCloseControlled={() => setIsSedeModalOpenOnMobile(false)}
            />

            {/* Conmutador Global Modo Músico / Modo Lector */}
            <button
              onClick={toggleMusicianMode}
              title={isMusicianMode ? "Desactivar modo músico (Ver solo letra lírica)" : "Activar modo músico (Ver acordes y teoría musical)"}
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

            {/* Botón de Copia de Seguridad */}
            <button
              onClick={() => setIsBackupModalOpen(true)}
              title="Copia de seguridad y datos"
              className="p-1.5 sm:p-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white transition-colors shrink-0"
            >
              <HardDrive className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
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
                    placeholder="Buscar canción, artista o tag..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 sm:py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                <button
                  onClick={() => {
                    setSongToEdit(null);
                    setIsEditorOpen(true);
                  }}
                  title="Crear nueva canción"
                  className="flex items-center gap-1 px-3 py-2 sm:py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shrink-0 shadow-sm transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden xs:inline">Nueva</span>
                </button>
              </div>

              {/* Lista de Canciones */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-1.5 sm:p-2 space-y-1 max-h-[calc(100vh-180px)] lg:max-h-[calc(100vh-250px)] overflow-y-auto">
                {filteredSongs.map(song => {
                  const hasLocalOverride = overrides.some(
                    o => o.baseSongId === song.id && o.sedeId === activeSedeId
                  );
                  const isSelected = song.id === selectedSongId;

                  return (
                    <div
                      key={song.id}
                      onClick={() => {
                        setSelectedSongId(song.id);
                        setMobileView('detail');
                      }}
                      className={`group p-3 rounded-xl cursor-pointer transition-all flex items-center justify-between active:scale-[0.99] ${
                        isSelected
                          ? 'bg-slate-800 border border-emerald-600/40 text-white shadow-md'
                          : 'hover:bg-slate-850 text-slate-300 hover:text-white'
                      }`}
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-sm font-semibold truncate">{song.title}</h4>
                          {hasLocalOverride && (
                            <span
                              title="Esta sede tiene una versión local adaptada"
                              className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"
                            />
                          )}
                        </div>
                        <p className="text-xs text-slate-400 truncate">
                          {song.artist || 'Himnario'} {isMusicianMode && `• Tono: ${song.originalKey}`}
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        {hasLocalOverride && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-medium">
                            Sede
                          </span>
                        )}

                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setCorrectionSong(song);
                          }}
                          title="Reportar corrección en catálogo general"
                          className="p-1 rounded text-slate-500 hover:text-amber-400 hover:bg-slate-900 transition-colors opacity-70 sm:opacity-0 sm:group-hover:opacity-100"
                        >
                          <Flag className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {filteredSongs.length === 0 && (
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
                  Sede actual: <strong className="text-emerald-400">{activeSedeId}</strong>. Las personalizaciones en el atril se guardan localmente para tu sede sin modificar el catálogo general.
                </p>
              </div>
            </div>

            {/* Columna Derecha: Vista de Canción (ReaderView por defecto vs MusicianView según isMusicianMode) */}
            <div className={`lg:col-span-8 ${
              mobileView === 'list' ? 'hidden lg:block' : 'block'
            }`}>
              {activeDisplaySong ? (
                isMusicianMode ? (
                  <MusicianView
                    song={activeDisplaySong}
                    activeSedeId={activeSedeId}
                    onEnterProjection={() => setIsProjectionMode(true)}
                    onSongUpdated={() => {}}
                    onBackToCatalog={() => setMobileView('list')}
                    onSwitchToLyrics={toggleMusicianMode}
                    onEditFullSong={() => {
                      if (activeBaseSong) {
                        setSongToEdit(activeBaseSong);
                        setIsEditorOpen(true);
                      }
                    }}
                  />
                ) : (
                  <ReaderView
                    song={activeDisplaySong}
                    onEnterProjection={() => setIsProjectionMode(true)}
                    onBackToCatalog={() => setMobileView('list')}
                    onEditSong={() => {
                      if (activeBaseSong) {
                        setSongToEdit(activeBaseSong);
                        setIsEditorOpen(true);
                      }
                    }}
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
            activeSedeId={activeSedeId}
            savedSetlists={setlists}
            isMusicianMode={isMusicianMode}
            onSelectSong={songId => {
              setSelectedSongId(songId);
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
            setMobileView('list');
          }
        }}
        onOpenSedeSelector={() => setIsSedeModalOpenOnMobile(true)}
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
          activeSedeId={activeSedeId}
          isMusicianMode={isMusicianMode}
          onClose={() => setIsEditorOpen(false)}
          onSave={savedSong => {
            setSelectedSongId(savedSong.id);
            setMobileView('detail');
          }}
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
    </div>
  );
}
