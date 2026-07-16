const config = Object.freeze({
  url: 'https://wmeknyvxkvhsuuvswdnb.supabase.co',
  functionsUrl: '/api',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtZWtueXZ4a3Zoc3V1dnN3ZG5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNjg5MzgsImV4cCI6MjA5OTY0NDkzOH0.BVhxcx-d1EHx0eP2AwlmIsYa7vYLjy_vfN1AtmKX5tw',
});

globalThis.__WITHMIND_SUPABASE_CONFIG__ = config;
globalThis.__SUPABASE_CONFIG__ = config;
globalThis.__WITHMIND_SUPABASE_URL__ = config.url;
globalThis.__WITHMIND_SUPABASE_ANON_KEY__ = config.anonKey;
globalThis.__WITHMIND_SUPABASE_FUNCTIONS_URL__ = config.functionsUrl;

export default config;
