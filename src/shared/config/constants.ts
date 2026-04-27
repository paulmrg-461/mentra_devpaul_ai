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

export const MIN_TRANSCRIPTION_LENGTH = 2;

export const PROCESSING_MESSAGES = {
  voice: 'Processing query...',
  vision: 'Analyzing scene...',
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
} as const;
