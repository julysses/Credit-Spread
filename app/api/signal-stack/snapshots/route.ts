import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export const dynamic = 'force-dynamic';

export async function GET() {
  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 503 });
  }

  const { data, error } = await sb
    .from('signal_snapshots')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

export async function POST(req: NextRequest) {
  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 503 });
  }

  const body = await req.json();

  const { data, error } = await sb
    .from('signal_snapshots')
    .insert([body])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

export async function PATCH(req: NextRequest) {
  const sb = getSupabase();
  if (!sb) {
    return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 503 });
  }

  const { id, ...updates } = await req.json();

  const { data, error } = await sb
    .from('signal_snapshots')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
