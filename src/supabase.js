import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://odaruqrhphvzjzafujpk.supabase.co'

const supabaseKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kYXJ1cXJocGh2emp6YWZ1anBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNjkyNzIsImV4cCI6MjA5Mzk0NTI3Mn0.6zVJSszg2NgbbxlDsR-xrLKiEwN8kygdnlQN9xtMFaI'

export const supabase = createClient(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  }
)
