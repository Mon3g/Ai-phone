export async function verifySupabaseAuth(request, supabase) {
  if (!supabase) {
    return { user: null, error: 'Supabase not configured' };
  }

  try {
    const authHeader = request.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (!token) return { user: null, error: 'missing token' };
    const { data, error } = await supabase.auth.getUser(token);
    if (error) return { user: null, error };
    return { user: data.user, error: null };
  } catch (err) {
    return { user: null, error: err };
  }
}
