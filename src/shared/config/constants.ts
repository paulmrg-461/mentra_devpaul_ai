export const WAKE_WORD = 'numa';

// STT aliases: es-ES transcribes "numa" as "deadpool"
export const WAKE_WORDS = ['numa', 'uma', 'muma', 'juma', 'puma', 'no mas', 'no ma', 'nomas', 'nomás'];

export const STOP_COMMANDS = ['detente', 'para ya'];

// Capture only — no immediate analysis, waits for follow-up question
export const PHOTO_CAPTURE_COMMANDS = [
  'toma una foto',
  'toma foto',
  'saca una foto',
  'saca foto',
  'captura foto',
  'take a photo',
  'take photo',
];

// Capture + immediate generic description
export const VISION_COMMANDS = [
  'analiza esto',
  'describe esto',
  'qué ves',
  'what do you see',
  'qué hay aquí',
  'lee esto',
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
export const NONFINAL_MIN_LENGTH = 20; // chars needed to trigger processing on non-final (continuous mode)

export const FOLLOW_UP_TIMEOUT_MS = 10_000;
export const LISTENING_TIMEOUT_MS = 15_000;
export const PHOTO_READY_TIMEOUT_MS = 20_000;
export const PROCESSING_TIMEOUT_MS = 40_000;

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
  ready: 'Numa ready.',
  voiceError: 'Fallo en el asistente de voz.',
  visionError: 'Fallo en el análisis de visión.',
  noTranscription: 'No te escuché bien, intenta de nuevo.',
  photoError: 'Error al capturar la foto.',
  photoReady: 'Foto capturada. ¿Qué quieres saber?',
  photoContextActive: 'Foto lista. Pregúntame.',
  followUpListening: '...',
  meetingStarted: 'Reunión iniciada. Escuchando y transcribiendo.',
  meetingEnded: 'Reunión terminada. Generando resumen...',
  meetingReady: 'En reunión. Di "Numa" para consultar.',
  meetingError: 'Error generando resumen de reunión.',
  continuousOn: 'Modo continuo activado. Habla libremente.',
  continuousOff: 'Modo continuo desactivado.',
} as const;
