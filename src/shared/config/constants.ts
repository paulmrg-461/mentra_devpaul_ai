export const WAKE_WORD = 'devpaul';

export const STOP_COMMANDS = ['detente', 'para'];

export const VISION_COMMANDS = [
  'take a photo',
  'toma una foto',
  'toma foto',
  'analiza esto',
  'describe esto',
  'qué ves',
  'what do you see',
];

export const MEETING_START_COMMANDS = [
  'inicia reunión',
  'inicia reunion',
  'iniciar reunión',
  'iniciar reunion',
  'empieza reunión',
  'empieza reunion',
  'comenzar reunión',
  'comenzar reunion',
];

export const MEETING_END_COMMANDS = [
  'termina reunión',
  'termina reunion',
  'finaliza reunión',
  'finaliza reunion',
  'fin de reunión',
  'fin de reunion',
  'terminar reunión',
  'terminar reunion',
];

export const MIN_TRANSCRIPTION_LENGTH = 2;

export const PROCESSING_MESSAGES = {
  voice: 'Processing query...',
  vision: 'Analyzing scene...',
  meetingQuery: 'Consultando reunión...',
  meetingSummary: 'Generando resumen...',
} as const;

export const USER_MESSAGES = {
  idle: '¿Qué necesitas?',
  listening: 'Escuchando...',
  capturing: 'Capturando foto...',
  stopped: 'Detenido.',
  ready: 'DevPaul ready.',
  voiceError: 'Fallo en el asistente de voz.',
  visionError: 'Fallo en el análisis de visión.',
  noTranscription: 'No te escuché bien, intenta de nuevo.',
  photoError: 'Error al capturar la foto.',
  meetingStarted: 'Reunión iniciada. Escuchando y transcribiendo.',
  meetingEnded: 'Reunión terminada. Generando resumen...',
  meetingReady: 'En reunión. Di "DevPaul" para consultar.',
  meetingError: 'Error generando resumen de reunión.',
} as const;
