// FILE: app/api/get-users/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // マスターキーを使って管理者権限でSupabaseに接続
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // 登録されている全ユーザー情報を取得（最大1000件設定）
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000
    });

    if (error) {
      throw error;
    }

    // 必要な情報（メールアドレスと氏名）だけを抽出してフロントに返す
    const userList = data.users.map(u => ({
      email: u.email,
      name: u.user_metadata?.name || u.user_metadata?.full_name || ''
    }));

    return NextResponse.json({ users: userList });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}