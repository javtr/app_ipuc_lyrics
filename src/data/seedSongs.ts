import { BaseSong, SedeSongOverride } from '../types';

const SEED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

export const SEED_SONGS: BaseSong[] = [
  {
    id: 'sublime-gracia',
    title: 'Sublime Gracia',
    artist: 'John Newton',
    originalKey: 'G',
    bpm: 72,
    timeSignature: '3/4',
    tags: ['Himno', 'Adoración', 'Gracia'],
    updatedAt: SEED_TIMESTAMP,
    syncSource: 'seed',
    sections: [
      {
        id: 'v1',
        type: 'verse',
        label: 'Verso 1',
        lines: [
          '[G]Sublime gracia del [C]Señor[G]',
          'Que a un [Em]infeliz sal[D]vó',
          'Fui [G]ciego mas hoy [C]veo [G]yo',
          'Per[Em]dido y Él [D]me ha[G]lló'
        ]
      },
      {
        id: 'v2',
        type: 'verse',
        label: 'Verso 2',
        lines: [
          'Su [G]gracia me enseñó [C]a te[G]mer',
          'Mis [Em]dudas ahu[D]yentó',
          '¡Oh [G]cuán precioso [C]fue a mi [G]ser',
          'Cuan[Em]do Él me [D]transfor[G]mó!'
        ]
      },
      {
        id: 'c1',
        type: 'chorus',
        label: 'Coro',
        lines: [
          '[G]¡Aleluya! [C]¡Ale[G]luya!',
          'A [Em]Cristo daré [D]loor',
          '[G]Por Su gracia y [C]Su per[G]dón',
          'Por [Em]siempre a Él [D]canta[G]ré'
        ]
      }
    ]
  },
  {
    id: 'cuan-grande-es-el',
    title: 'Cuán Grande es Él',
    artist: 'Carl Boberg',
    originalKey: 'A',
    bpm: 68,
    timeSignature: '4/4',
    tags: ['Himno', 'Majestad', 'Adoración'],
    updatedAt: SEED_TIMESTAMP,
    syncSource: 'seed',
    sections: [
      {
        id: 'v1',
        type: 'verse',
        label: 'Verso 1',
        lines: [
          'Se[A]ñor mi Dios al contemplar [D]los cielos',
          'El [A]firmamento y las [E]estrellas [A]mil',
          'Al oír Tu voz en los po[D]tentes truenos',
          'Y [A]ver brillar al [E]sol en su ce[A]nit'
        ]
      },
      {
        id: 'c1',
        type: 'chorus',
        label: 'Coro',
        lines: [
          'Mi corazón se [D]llena de emoción',
          '¡Cuán grande es [A]Él! [F#m]¡Cuán grande es [Bm]Él! [E]',
          'Mi corazón se [D]llena de emoción',
          '¡Cuán grande es [A]Él! [E]¡Cuán grande es [A]Él!'
        ]
      }
    ]
  },
  {
    id: 'la-bondad-de-dios',
    title: 'La Bondad de Dios',
    artist: 'Bethel Music',
    originalKey: 'G',
    bpm: 70,
    timeSignature: '4/4',
    tags: ['Alabanza', 'Gratitud', 'Contemporánea'],
    updatedAt: SEED_TIMESTAMP,
    syncSource: 'seed',
    sections: [
      {
        id: 'v1',
        type: 'verse',
        label: 'Verso 1',
        lines: [
          'Te [G]amo Dios, Tu gracia nunca [C]falla',
          'Todos mis [G]días en Tus manos [D]están',
          'Desde el [Em]momento en que des[C]pierto',
          'Hasta el [G]anoche[D]cer[Em]',
          'Canta[C]ré de la [D]bondad de [G]Dios'
        ]
      },
      {
        id: 'c1',
        type: 'chorus',
        label: 'Coro',
        lines: [
          'En mi [C]vida has sido bueno',
          'En mi [G]vida has sido tan, tan [D]fiel',
          'Con cada a[C]liento que me das',
          'Canta[G]ré de la [D]bondad de [Em]Dios',
          'Canta[C]ré de la [D]bondad de [G]Dios'
        ]
      }
    ]
  }
];

export const SEED_OVERRIDES: SedeSongOverride[] = [
  {
    id: 'sublime-gracia_sede-palestina',
    baseSongId: 'sublime-gracia',
    sedeId: 'sede-palestina',
    customTitle: 'Sublime Gracia (Versión Acústica Palestina)',
    customKey: 'A', // Tono preferido de la sede
    localNotes: 'Entrada instrumental con guitarra acústica y pad suave. Repetir coro 2 veces al final.',
    updatedAt: SEED_TIMESTAMP,
    syncSource: 'seed',
    customSections: [
      {
        id: 'v1',
        type: 'verse',
        label: 'Verso 1 (Palestina)',
        lines: [
          '[A]Sublime gracia del [D]Señor[A]',
          'Que a un [F#m]infeliz sal[E]vó',
          'Fui [A]ciego mas hoy [D]veo [A]yo',
          'Per[F#m]dido y Él [E]me ha[A]lló'
        ]
      },
      {
        id: 'c1',
        type: 'chorus',
        label: 'Coro',
        lines: [
          '[A]¡Aleluya! [D]¡Ale[A]luya!',
          'A [F#m]Cristo daré [E]loor',
          '[A]Por Su gracia y [D]Su per[A]dón',
          'Por [F#m]siempre a Él [E]canta[A]ré'
        ]
      },
      {
        id: 'b1',
        type: 'bridge',
        label: 'Puente Especial Palestina',
        lines: [
          '[D]Cadena rota [A]soy libre al fin',
          '[F#m]Mi Salvador me [E]rescató',
          '[D]Y en Su misericor[A]dia eterna',
          'Su [E]amor me coronó'
        ]
      }
    ]
  }
];
