export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export interface SupabaseEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}

export interface SupabaseUser {
  id: string;
  email: string | null;
  role?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

export interface PromptTemplateRow {
  prompt_template_id: number;
  prompt_type: string;
  version_no: number;
  template_name: string;
  system_prompt: string;
  user_prompt_template: string;
  template_variables: Json;
  output_schema: Json;
  active: boolean;
}

export interface LlmFlowContext {
  [key: string]: Json;
}
