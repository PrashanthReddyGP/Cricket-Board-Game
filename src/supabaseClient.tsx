// src/supabaseClient.ts

import { createClient } from '@supabase/supabase-js'

// Use Vite's import.meta.env object
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!

// The rest of your code is the same
export const supabase = createClient(supabaseUrl, supabaseAnonKey)