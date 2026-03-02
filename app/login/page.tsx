// FILE: app/login/page.tsx
'use client';

import { useState } from 'react';
import { supabase } from '../utils/supabase'; // 階層に注意
import { useRouter } from 'next/navigation';

// ★ NEW: 管理者（事務局Staff）のメールアドレスをここで一括管理します
// スタッフが増えたら、ここにカンマ区切りで追加するだけでOKです
const ADMIN_EMAILS = [
  "eltontanaka@gmail.com",
  "admin@example.com"
];

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<'student' | 'admin'>('student');
  const router = useRouter();

  const handleLogin = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    
    // Supabaseで認証チェック
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert('ログイン失敗: メールアドレスかパスワードが間違っています。');
      setLoading(false);
      return;
    }

    // ログイン成功後、権限をチェック
    const loggedInEmail = data.user?.email || '';
    const isStaff = ADMIN_EMAILS.includes(loggedInEmail);

    if (role === 'admin') {
      // 「管理者ログイン」タブから入ろうとした場合
      if (isStaff) {
        router.push('/admin'); // 権限があれば管理画面へ
      } else {
        // ★ 学生が管理者タブから入ろうとした場合はブロックして強制ログアウト
        alert('【エラー】管理者権限がありません。\n学生用ログインから入り直してください。');
        await supabase.auth.signOut();
        setLoading(false);
      }
    } else {
      // 「学生ログイン」タブから入ろうとした場合
      if (isStaff) {
        // スタッフが間違えて学生タブから入った場合は、気を利かせて管理画面へ誘導
        router.push('/admin');
      } else {
        router.push('/dashboard'); // 学生はマイページへ
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        
        <div className="flex text-center font-bold">
          <button
            onClick={() => setRole('student')}
            className={`w-1/2 py-4 transition-colors ${
              role === 'student' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            学生ログイン
          </button>
          <button
            onClick={() => setRole('admin')}
            className={`w-1/2 py-4 transition-colors ${
              role === 'admin' 
                ? 'bg-gray-800 text-white' 
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            管理者ログイン
          </button>
        </div>

        <div className="p-8">
          <h1 className={`text-xl font-bold mb-6 text-center ${role === 'student' ? 'text-blue-600' : 'text-gray-800'}`}>
            {role === 'student' ? 'Buddy Scheduleへようこそ' : '事務局管理画面'}
          </h1>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                {role === 'student' ? '学生メールアドレス' : '管理者メールアドレス'}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={role === 'student' ? 'student@example.com' : 'admin@example.com'}
                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-3 border focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">パスワード</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm p-3 border focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              />
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-lg font-bold text-white shadow-md transition-transform active:scale-95 ${
                role === 'student' 
                  ? 'bg-blue-600 hover:bg-blue-700' 
                  : 'bg-gray-800 hover:bg-gray-900'
              } disabled:opacity-50`}
            >
              {loading ? '認証中...' : 'ログインする'}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-gray-400">
            {role === 'student' 
              ? '※ ログインできない場合は事務局にお問い合わせください'
              : '※ 管理者権限が必要です'}
          </div>
        </div>
      </div>
    </div>
  );
}