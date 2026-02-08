'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import * as XLSX from 'xlsx';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const router = useRouter();

  // 🔐 1. 管理者チェック（studentaさんだけ通す）
  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      // ※ここで管理者にするメールアドレスを指定
      if (user && user.email === 'studenta@example.com') {
        setIsAdmin(true);
      } else {
        alert('管理者権限がありません。');
        router.push('/');
      }
      setLoading(false);
    };
    checkUser();
  }, [router]);

  // 📂 2. Excel読み込み＆登録
  const handleFileUpload = async (e: any) => {
    const file = e.target.files[0];
    if (!file) return;

    setStatus('読み込み中...');
    const reader = new FileReader();

    reader.onload = async (evt: any) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        setStatus(`${data.length}件のデータを登録中...`);

        for (const row: any of data) {
          // A. イベントを登録（同じ名前・日付なら上書き）
          const { data: eventData, error: eventError } = await supabase
            .from('events')
            .upsert({ 
              title: row['イベント名'], 
              date: row['日付'],
              meeting_time: row['集合時間'],
              meeting_place: row['集合場所']
            }, { onConflict: 'title, date' })
            .select()
            .single();

          if (eventError) throw eventError;

          // B. 学生を紐付け
          if (eventData) {
            await supabase
              .from('assignments')
              .insert({
                student_email: row['メールアドレス'],
                event_id: eventData.id
              });
          }
        }
        
        setStatus('✅ 完了！データが更新されました。');
        alert('登録成功！');

      } catch (error) {
        console.error(error);
        setStatus('❌ エラー：Excelの列名が正しいか確認してください（イベント名, 日付, 集合時間, 集合場所, メールアドレス）');
      }
    };
    reader.readAsBinaryString(file);
  };

  if (loading) return <div className="p-8">確認中...</div>;
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-xl mx-auto bg-white p-8 rounded shadow">
        <h1 className="text-2xl font-bold mb-4">事務局用データ登録</h1>
        <p className="mb-4 text-sm text-gray-600">
          Excelファイルをアップロードして、スケジュールを一括登録します。<br/>
          ※列名：イベント名, 日付, 集合時間, 集合場所, メールアドレス
        </p>
        
        <input 
          type="file" 
          accept=".xlsx, .xls"
          onChange={handleFileUpload}
          className="block w-full text-sm text-slate-500
            file:mr-4 file:py-2 file:px-4
            file:rounded-full file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            hover:file:bg-blue-100"
        />

        {status && (
          <div className="mt-4 p-3 bg-blue-50 text-blue-800 rounded">
            {status}
          </div>
        )}
      </div>
    </div>
  );
}