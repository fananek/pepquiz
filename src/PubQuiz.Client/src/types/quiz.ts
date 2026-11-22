export type QuestionType = 'MultipleChoice' | 'TextInput' | 'Ordering';
export type JokerMode = 'OnDemand' | 'PreSelect';
export type GameState =
  | 'Lobby'
  | 'QuizIntro'
  | 'RoundIntro'
  | 'QuestionReady'
  | 'QuestionActive'
  | 'QuestionLocked'
  | 'QuestionReveal'
  | 'Leaderboard'
  | 'Finished';

export type AnswerEvaluation = 'Pending' | 'Correct' | 'HalfPoint' | 'Wrong';
export type BonusTaskClaimStatus = 'Pending' | 'Approved' | 'Rejected';

export interface BonusTask {
  id: string;
  title: string;
  description?: string | null;
  points: number;
  maxCompletionsPerTeam: number;
}

export interface HostBonusTaskClaim {
  id: string;
  teamId: string;
  teamName: string;
  avatarId: string;
  avatarColor: string;
  taskId: string;
  taskTitle: string;
  taskPoints: number;
  maxCompletionsPerTeam: number;
  teamApprovedCount: number;
  note?: string | null;
  status: BonusTaskClaimStatus;
  pointsAwarded: number;
  hostComment?: string | null;
  createdAtUtc: string;
  reviewedAtUtc?: string | null;
}

export interface PlayerBonusTaskClaim {
  id: string;
  taskId: string;
  note?: string | null;
  status: BonusTaskClaimStatus;
  pointsAwarded: number;
  hostComment?: string | null;
  createdAtUtc: string;
  reviewedAtUtc?: string | null;
}

export interface QuizSummary {
  id: string;
  title: string;
  description?: string | null;
  roundCount: number;
  questionCount: number;
  defaultLanguage: string;
  availableLanguages: string[];
  jokerMode: JokerMode;
  jokerCount: number;
  autoStartTimer: boolean;
}

export interface PublicMedia {
  type: 'audio' | 'video' | 'image' | 'youtube' | string;
  url: string;
  rawSrc: string;
  startSeconds?: number | null;
  endSeconds?: number | null;
  playbackMode: 'duringQuestion' | 'onReveal' | string;
  altText?: string | null;
  transcript?: string | null;
  captionsUrl?: string | null;
}

export interface ActiveQuestionPublic {
  id: string;
  questionNumberInRound: number;
  totalQuestionsInRound: number;
  roundNumber: number;
  roundTitle: string;
  isFinalRound: boolean;
  type: QuestionType;
  text: string;
  options?: string[] | null;
  timeLimitSeconds: number;
  basePoints: number;
  speedBonusMax: number;
  gracePeriodSeconds: number;
  startedAtUtc?: string | null;
  endsAtUtc?: string | null;
  isPaused: boolean;
  pausedRemainingSeconds?: number | null;
  media?: PublicMedia | null;
  correctAnswer?: string | null;
  correctOrder?: string[] | null;
  acceptedAnswers?: string[] | null;
  hostNote?: string | null;
}

export interface LeaderboardEntry {
  teamId: string;
  name: string;
  avatarId: string;
  avatarColor: string;
  score: number;
  previousRank: number;
  rank: number;
  lastQuestionDelta: number;
  isConnected: boolean;
  jokersRemaining: number;
  correctCount: number;
}

export interface TeamQuestionOutcome {
  teamId: string;
  teamName: string;
  avatarId: string;
  avatarColor: string;
  hasAnswered: boolean;
  answerSequence?: number | null;
  elapsedSeconds?: number | null;
  jokerUsed: boolean;
  evaluation?: AnswerEvaluation | null;
  pointsAwarded: number;
  answerText?: string | null;
  orderedItems?: string[] | null;
}

export interface HostAnswerDetail {
  teamId: string;
  teamName: string;
  avatarId: string;
  avatarColor: string;
  isConnected: boolean;
  hasAnswered: boolean;
  answerSequence?: number | null;
  receivedAtUtc?: string | null;
  effectiveElapsedSeconds?: number | null;
  estimatedLatencyMs?: number | null;
  answerText?: string | null;
  orderedItems?: string[] | null;
  jokerUsed: boolean;
  autoEvaluation: AnswerEvaluation;
  finalEvaluation: AnswerEvaluation;
  isOverriddenByHost: boolean;
  matchedDistance?: number | null;
  basePointsAwarded: number;
  speedBonusAwarded: number;
  jokerDelta: number;
  totalPointsAwarded: number;
}

export interface RoundOverview {
  roundIndex: number;
  roundNumber: number;
  title: string;
  description?: string | null;
  isFinal: boolean;
  pointMultiplier: number;
  questionCount: number;
  questionIds: string[];
}

export interface ScreenBannerMessage {
  id: string;
  text: string;
  kind: 'info' | 'hint' | 'warning';
  sentAtUtc: string;
}

export interface PlayerMessage {
  id: string;
  targetTeamId?: string | null;
  text: string;
  sentAtUtc: string;
}

export interface EveningStatistics {
  fastestTeamName?: string | null;
  fastestAvgResponseSeconds?: number | null;
  bestRoundNumber?: number | null;
  bestRoundTitle?: string | null;
  bestRoundAccuracyPercent?: number | null;
  totalQuestionsPlayed: number;
  totalAnswersSubmitted: number;
}

export interface HostTeamInfo {
  teamId: string;
  name: string;
  avatarId: string;
  avatarColor: string;
  score: number;
  isConnected: boolean;
  recoveryCode: string;
  reconnectUrl: string;
  preSelectedJokersCount: number;
}

export interface PublicTeamSummary {
  teamId: string;
  name: string;
  avatarId: string;
  avatarColor: string;
  isConnected: boolean;
  score: number;
}

export interface PlayerSelf {
  teamId: string;
  teamName: string;
  avatarId: string;
  avatarColor: string;
  recoveryCode: string;
  score: number;
  rank: number;
  jokersRemaining: number;
  preSelectedJokerQuestionIds: string[];
  hasSubmittedCurrentQuestion: boolean;
  currentQuestionJokerActive: boolean;
  submittedAnswerText?: string | null;
  submittedOrderedItems?: string[] | null;
  lastEvaluation?: AnswerEvaluation | null;
  lastPointsAwarded: number;
  taskClaims: PlayerBonusTaskClaim[];
}

export interface GameStateBroadcast {
  sessionId: string;
  role: 'Host' | 'Screen' | 'Player' | string;
  state: GameState;
  serverUtcNow: string;
  quizId?: string | null;
  quizTitle?: string | null;
  quizDescription?: string | null;
  quizLanguage: string;
  availableQuizLanguages: string[];
  quizRules: string[];
  jokerMode: JokerMode;
  jokerCount: number;
  bonusTasks: BonusTask[];
  autoStartTimer: boolean;
  canReturnToPreviousScreen: boolean;
  returnScreenState?: GameState | null;
  joinCode: string;
  joinUrl: string;
  screenCode?: string | null;
  screenUrl?: string | null;
  currentRoundIndex: number;
  currentQuestionIndex: number;
  currentRound?: RoundOverview | null;
  rounds: RoundOverview[];
  currentQuestion?: ActiveQuestionPublic | null;
  connectedTeamsCount: number;
  totalTeamsCount: number;
  answeredTeamsCount: number;
  leaderboard: LeaderboardEntry[];
  questionOutcomes: TeamQuestionOutcome[];
  screenBanner?: ScreenBannerMessage | null;
  messages: PlayerMessage[];
  statistics?: EveningStatistics | null;
  hostAnswers?: HostAnswerDetail[] | null;
  hostTeams?: HostTeamInfo[] | null;
  hostTaskClaims?: HostBonusTaskClaim[] | null;
  self?: PlayerSelf | null;
}

// --- Quiz Designer Models ---

export interface DesignerMediaAttachment {
  type: 'audio' | 'video' | 'image' | 'youtube';
  src: string;
  startSeconds?: number | null;
  endSeconds?: number | null;
  playbackMode: 'duringQuestion' | 'onReveal';
  altText?: string | null;
  transcript?: string | null;
  captionsSrc?: string | null;
}

export interface DesignerQuestion {
  id: string;
  type: QuestionType;
  text: string;
  options?: string[] | null;
  correctAnswer?: string | null;
  acceptedAnswers?: string[] | null;
  correctOrder?: string[] | null;
  hostNote?: string | null;
  timeLimitSeconds?: number | null;
  basePoints?: number | null;
  speedBonusMax?: number | null;
  gracePeriodSeconds?: number | null;
  media?: DesignerMediaAttachment | null;
}

export interface DesignerRound {
  roundNumber: number;
  title: string;
  description?: string | null;
  isFinal: boolean;
  pointMultiplier: number;
  questions: DesignerQuestion[];
}

export interface DesignerQuizSettings {
  defaultTimeLimitSeconds: number;
  gracePeriodSeconds: number;
  basePoints: number;
  speedBonusMax: number;
  jokerMode: JokerMode;
  jokerCount: number;
  autoStartTimer: boolean;
  textMatchMaxDistance?: number | null;
}

export interface DesignerQuizPackage {
  id: string;
  title: string;
  description?: string | null;
  defaultLanguage: string;
  rules?: string[] | null;
  settings: DesignerQuizSettings;
  bonusTasks?: BonusTask[] | null;
  rounds: DesignerRound[];
}

export interface DesignerTranslation {
  language: string;
  title?: string | null;
  description?: string | null;
  rules?: string[] | null;
  rounds?: Record<string, { title?: string | null; description?: string | null }> | null;
  questions?: Record<
    string,
    {
      text?: string | null;
      options?: string[] | null;
      correctAnswer?: string | null;
      acceptedAnswers?: string[] | null;
      correctOrder?: string[] | null;
      hostNote?: string | null;
      mediaAltText?: string | null;
      mediaTranscript?: string | null;
    }
  > | null;
  bonusTasks?: Record<string, { title?: string | null; description?: string | null }> | null;
}

export interface QuizDesignerDetail {
  quiz: DesignerQuizPackage;
  mediaFiles: string[];
  translations: Record<string, DesignerTranslation>;
}

export interface AuthTokenResponse {
  token: string;
  role: string;
  teamId?: string | null;
  teamName?: string | null;
  expiresAtUtc: string;
}

export interface SubmitAnswerResult {
  success: boolean;
  error?: string | null;
  answerSequence?: number | null;
  effectiveElapsedSeconds?: number | null;
  alreadySubmitted: boolean;
}
