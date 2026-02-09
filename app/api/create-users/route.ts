import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { users, defaultPassword } = body;

    if (!users || !Array.isArray(users)) {
      return NextResponse.json({ error: 'データ形式が正しくありません' }, { status: 400 });
    }

    // マスターキーを使って管理者権限でSupabaseに接続
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!, // ここで裏鍵を使います
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const results = [];
    
    // ループして一人ずつ登録
    for (const user of users) {
      const email = user['メールアドレス'] || user['Email'] || user['email'];
      
      if (!email) continue;

      // ユーザーを作成（すでに存在する場合はエラーになるが、それは無視してOK）
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: String(email).trim(),
        password: defaultPassword, // 管理者が決めた初期パスワード
        email_confirm: true, // メール確認をスキップして即ログイン可能にする
        user_metadata: { name: user['氏名'] || '' }
      });

      if (error) {
        results.push({ email, status: 'Error', message: error.message });
      } else {
        results.push({ email, status: 'Success', id: data.user.id });
      }
    }

    return NextResponse.json({ message: '処理完了', results });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}