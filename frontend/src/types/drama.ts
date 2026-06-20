export interface DramaEpisode {
  id: string;
  project_id: string;
  order_num: number;
  title: string;
  summary: string;
  beat_sheet: string;
  hook: string;
  target_duration: number;
  created_at: string;
  updated_at: string;
}

export interface DramaShotCharacter {
  name: string;
  variant: string;
}

export interface DramaShotDialogue {
  speaker: string;
  text: string;
  emotion: string;
}

export interface DramaShotSFX {
  type: string;
  desc: string;
  level: string;
}

export interface DramaShotBGM {
  style: string;
  mood: string;
}

export interface DramaLegacyAssetVariant {
  desc: string;
  prompt: string;
}

export interface DramaCharacterVariant {
  description: string;
  outfit: string;
  face_modifier: string;
  prompt: string;
}

export interface DramaCharacterContent {
  name: string;
  character_id: string;
  gender: string;
  age: number;
  identity: string;
  personality: {
    core_traits: string;
    speech_style: string;
    motivation: string;
  };
  appearance: {
    hair: string;
    face_features: string;
    body_type: string;
  };
  variants: Record<string, DramaCharacterVariant>;
  voice_default: {
    timbre: string;
    speed: string;
    accent: string;
  };
}

export interface DramaSceneVariant {
  lighting: string;
  prompt: string;
}

export interface DramaSceneContent {
  name: string;
  scene_id: string;
  type: string;
  era: string;
  description: string;
  key_elements: string[];
  variants: Record<string, DramaSceneVariant>;
}

export interface DramaPropContent {
  name: string;
  prop_id: string;
  type: string;
  story_function: string;
  prompt: string;
}

export interface DramaStyleContent {
  style_type: string;
  era: string;
  character_prompt_suffix: string;
  scene_prompt_suffix: string;
  storyboard_prompt_suffix: string;
  storyboard_enhance_tags: string[];
  target_ratio: string;
}

export type DramaAssetContent =
  | DramaCharacterContent
  | DramaSceneContent
  | DramaPropContent
  | DramaStyleContent
  | Record<string, unknown>;

export interface DramaCharacterTurnaroundMeta {
  prompt?: string;
  provider?: string;
  model?: string;
  aspect_ratio?: string;
  source_url?: string;
  generated_at?: string;
}

export interface DramaAsset {
  id: string;
  project_id: string;
  type: string;
  name: string;
  description: string;
  prompt: string;
  tags: string[];
  variants: Record<string, DramaLegacyAssetVariant>;
  content: DramaAssetContent;
  reference_path: string;
  preview_url: string;
  turnaround_path: string;
  turnaround_url: string;
  turnaround_meta: DramaCharacterTurnaroundMeta;
  version: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface DramaCharacterTurnaroundFailure {
  asset_id: string;
  name: string;
  /** Backend-classified error category. Optional for backwards compat. */
  category?:
    | "content_policy"
    | "bad_request"
    | "rate_limit"
    | "timeout"
    | "network"
    | "api_error"
    | "unknown";
  /** Human-readable Chinese reason. Optional for backwards compat. */
  reason?: string;
  /** Raw error string from the backend. */
  error: string;
}

export interface DramaCharacterTurnaroundBatchResponse {
  total: number;
  generated: number;
  skipped: number;
  failed: number;
  failures: DramaCharacterTurnaroundFailure[];
  assets: DramaAsset[];
  message: string;
}

export interface DramaCharacterReenrichResponse {
  total: number;
  enriched: number;
  skipped: number;
  failed: number;
  failures: DramaCharacterTurnaroundFailure[];
  message: string;
}

export interface DramaSceneSurvivor {
  name: string;
  asset_id: string;
}

export interface DramaSceneDedupeResponse {
  total_scenes: number;
  groups_merged: number;
  deleted: number;
  renamed: number;
  shots_repointed: number;
  survivors: DramaSceneSurvivor[];
  message: string;
}

export interface DramaStyleRegenerateResponse {
  style_type: string;
  character_prompt_suffix: string;
  scene_prompt_suffix: string;
  storyboard_prompt_suffix: string;
  storyboard_enhance_tags: string[];
  asset_id: string;
  message: string;
}

export interface DramaAssetCardsResponse {
  created: number;
  character_count: number;
  scene_count: number;
  prop_count: number;
  style_count: number;
  assets: DramaAsset[];
  message: string;
  validation_issues?: string[];
  turnaround_summary?: DramaCharacterTurnaroundBatchResponse | null;
}

export interface DramaShot {
  id: string;
  project_id: string;
  episode_id: string;
  order_num: number;
  title: string;
  description: string;
  action_desc: string;
  dialogue: DramaShotDialogue;
  dialogue_text: string;
  duration: number;
  camera_size: string;
  camera_angle: string;
  camera_movement: string;
  emotion: string;
  emotion_level: number;
  character_names: string[];
  characters: DramaShotCharacter[];
  scene_name: string;
  scene_variant: string;
  sfx: DramaShotSFX[];
  bgm: DramaShotBGM;
  source_anchor: string;
  narration: string;
  start_frame_prompt: string;
  end_frame_prompt: string;
  video_prompt: string;
  start_frame_path: string;
  start_frame_url: string;
  end_frame_path: string;
  end_frame_url: string;
  keyframe_status: string;
  qc_status: string;
  qc_summary: string;
  qc_issues: Array<Record<string, unknown>>;
  qc_checked_at: string;
  rework_notes: string;
  status: string;
  selected_video_path: string;
  selected_video_url: string;
  created_at: string;
  updated_at: string;
}

export interface DramaTask {
  id: string;
  project_id: string;
  shot_id: string;
  task_type: string;
  provider: string;
  model: string;
  status: "pending" | "running" | "success" | "failed" | "cancelled";
  progress: number;
  message: string;
  output_path: string;
  output_url: string;
  payload: Record<string, unknown>;
  error_reason: string;
  created_at: string;
  updated_at: string;
  finished_at: string;
}

export interface DramaProviderModelOption {
  id: string;
  provider: string;
  capability: string;
  label: string;
  description: string;
  aspect_ratio: string;
  resolution: string;
  mode: string;
  min_images: number;
  max_images: number;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface DramaProviderCatalog {
  image_models: DramaProviderModelOption[];
  video_models: DramaProviderModelOption[];
}

export interface DramaProject {
  id: string;
  user_id: string;
  name: string;
  genre: string;
  mode: string;
  aspect_ratio: string;
  visual_style: string;
  synopsis: string;
  source_text: string;
  status: string;
  blueprint_status: string;
  blueprint_error: string;
  target_duration: number;
  storage_root: string;
  created_at: string;
  updated_at: string;
  asset_count: number;
  shot_count: number;
  task_count: number;
  render_ready_count: number;
}

export interface DramaProjectDetail extends DramaProject {
  episodes: DramaEpisode[];
  assets: DramaAsset[];
  shots: DramaShot[];
  tasks: DramaTask[];
}

export interface DramaProjectCreate {
  user_id?: string;
  name: string;
  genre?: string;
  mode?: string;
  aspect_ratio?: string;
  visual_style?: string;
  synopsis?: string;
  source_text?: string;
  target_duration?: number;
}

export interface DramaProjectUpdate {
  name?: string;
  genre?: string;
  mode?: string;
  aspect_ratio?: string;
  visual_style?: string;
  synopsis?: string;
  source_text?: string;
  status?: string;
  blueprint_status?: string;
  blueprint_error?: string;
  target_duration?: number;
}

export interface DramaBlueprintRequest {
  source_text: string;
  direction?: string;
  overwrite_existing?: boolean;
}

export interface DramaBlueprintResponse {
  project: DramaProject;
  episodes_added: number;
  assets_added: number;
  shots_added: number;
}

export interface DramaCopilotAdvice {
  executive_summary: string;
  strengths: string[];
  risks: string[];
  next_actions: string[];
  prompt_improvements: string[];
}

export interface DramaAssetCreate {
  type?: string;
  name: string;
  description?: string;
  prompt?: string;
  tags?: string[];
  variants?: Record<string, DramaLegacyAssetVariant>;
  content?: DramaAssetContent;
  reference_path?: string;
  version?: number;
  status?: string;
}

export interface DramaAssetUpdate {
  type?: string;
  name?: string;
  description?: string;
  prompt?: string;
  tags?: string[];
  variants?: Record<string, DramaLegacyAssetVariant>;
  content?: DramaAssetContent;
  reference_path?: string;
  version?: number;
  status?: string;
}

export interface DramaShotCreate {
  episode_id?: string;
  order_num?: number;
  title: string;
  description?: string;
  action_desc?: string;
  dialogue?: DramaShotDialogue;
  duration?: number;
  camera_size?: string;
  camera_angle?: string;
  camera_movement?: string;
  emotion?: string;
  emotion_level?: number;
  character_names?: string[];
  characters?: DramaShotCharacter[];
  scene_name?: string;
  scene_variant?: string;
  sfx?: DramaShotSFX[];
  bgm?: DramaShotBGM;
  source_anchor?: string;
  narration?: string;
  start_frame_prompt?: string;
  end_frame_prompt?: string;
  video_prompt?: string;
  status?: string;
}

export interface DramaShotUpdate extends Partial<DramaShotCreate> {
  start_frame_path?: string;
  end_frame_path?: string;
  keyframe_status?: string;
  qc_status?: string;
  qc_summary?: string;
  qc_issues?: Array<Record<string, unknown>>;
  qc_checked_at?: string;
  rework_notes?: string;
  selected_video_path?: string;
}

export interface DramaRenderRequest {
  provider?: string;
  model?: string;
  notes?: string;
  start_asset_id?: string;
  end_asset_id?: string;
  options?: Record<string, unknown>;
}

export interface DramaAssetGenerateRequest {
  provider?: string;
  model?: string;
  extra_prompt?: string;
  prompt_override?: string;
  options?: Record<string, unknown>;
}

export interface DramaCharacterTurnaroundRequest {
  provider?: string;
  model?: string;
  extra_prompt?: string;
  prompt_override?: string;
  options?: Record<string, unknown>;
}

export interface DramaShotFrameGenerateRequest {
  provider?: string;
  model?: string;
  extra_prompt?: string;
  overwrite_existing?: boolean;
  options?: Record<string, unknown>;
}

export interface DramaBatchFrameGenerateRequest extends DramaShotFrameGenerateRequest {
  shot_ids?: string[];
}

export interface DramaBatchRenderRequest {
  provider?: string;
  model?: string;
  notes?: string;
  shot_ids?: string[];
  overwrite_existing?: boolean;
  options?: Record<string, unknown>;
}

export interface DramaQualityCheckRequest {
  focus?: string;
}

export interface DramaQualityCheckResult {
  shot: DramaShot;
  summary: string;
  status: string;
  issues: Array<Record<string, unknown>>;
}

export interface DramaReworkRequest {
  mode?: "regenerate_frames" | "rerender_video";
  provider?: string;
  model?: string;
  notes?: string;
  apply_prompt_patch?: boolean;
  extra_prompt?: string;
  options?: Record<string, unknown>;
}

export interface DramaReworkResponse {
  shot?: DramaShot;
  task?: DramaTask;
}

export interface DramaBatchActionResponse {
  success_count: number;
  skipped_count: number;
  item_ids: string[];
  message: string;
}

export interface DramaBatchQualityCheckResponse extends DramaBatchActionResponse {
  pass_count: number;
  warning_count: number;
  fail_count: number;
}

export interface DramaAgentSession {
  id: string;
  project_id: string;
  user_id: string;
  status: string;
  stage: string;
  created_at: string;
  updated_at: string;
}

export interface DramaAgentTask {
  id: string;
  session_id: string;
  project_id: string;
  task_type: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  user_message: string;
  assistant_content: string;
  tool_events: DramaAgentToolEvent[];
  error_message: string;
  created_at: string;
  updated_at: string;
  started_at: string;
  finished_at: string;
}

export interface DramaAgentToolEvent {
  type: "tool_start" | "tool_end";
  name: string;
  input?: string;
  result?: string;
}

export interface DramaAgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  toolEvents?: DramaAgentToolEvent[];
  taskId?: string;
}
