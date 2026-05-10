import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://odaruqrhphvzjzafujpk.supabase.co'
const supabaseKey = 'sb_publishable_Rx2vW7zPoB4L5qiMFgfegQ_2MiJt70h'

export const supabase = createClient(supabaseUrl, supabaseKey)