'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import * as XLSX from 'xlsx';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [events, setEvents] = useState<any[]>([]); 
  const router = useRouter();

  const fetchEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('date', { ascending: true });
    
    if (error) console.error(error);
    else setEvents(data || []);
  }, []);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      // ↓ ご自身のアドレスとテスト用アドレスを許可
      if (user && (user.email === 'studenta@example.com' || user.email === 'eltontanaka@gmail.com')) {
        setIsAdmin(true);
        fetchEvents(); 
      } else {
        alert('管理者権限がありません');
        router.push('/');
      }
      setLoading(false);
    };
    checkUser();
  }, [router, fetchEvents]);

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`本当に「${title}」を削除しますか？`)) return;
    try {
      const { error } = await supabase.from('events').delete().eq('id', id);
      if (error) throw error;
      alert('削除しました');
      fetchEvents(); 
    } catch (error) {
      alert('削除に失敗しました');
      console.error(error);
    }
  };

  // ★ここが進化したポイント！柔軟にデータを読み取る関数
  const getColumnValue = (row: any, targetKey: string) => {
    // 1. そのまま探す
    if (row[targetKey] !== undefined) return row[targetKey];
    // 2. 空白を無視して探す（"メールアドレス " も " メールアドレス" もOKにする）
    const foundKey = Object.keys(row).find(k => k.trim() === targetKey);
    return foundKey ? row[foundKey] : undefined;
  };

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
        const data: any[] = XLSX.utils.sheet_to_json(ws, { raw: false });

        setStatus(`${data.length}件のデータを確認。登録を開始します...`);

        let eventCount = 0;
        let assignCount = 0;

        for (const row of data) {
          // ★柔軟な読み取り関数を使う
          const title = getColumnValue(row, 'イベント名');
          const date = getColumnValue(row, '日付');
          const time = getColumnValue(row, '集合時間');
          const place = getColumnValue(row, '集合場所');
          const program = getColumnValue(row, 'プログラム名');
          const email = getColumnValue(row, 'メールアドレス');

          if (!title || !date) continue; // 必須項目がなければスキップ

          // A. イベント登録
          const { data: eventData, error: eventError } = await supabase
            .from('events')
            .upsert({ 
              title: title, 
              date: date,
              meeting_time: time,
              meeting_place: place,
              program_name: program
            }, { onConflict: 'title, date' })
            .select()
            .single();

          if (eventError) throw eventError;
          eventCount++;

          // B. 割り当て登録（メールアドレスがあれば）
          if (eventData && email) {
            // メールの前後の空白もついでに掃除しておく
            const cleanEmail = String(email).trim();
            
            await supabase
              .from('assignments')
              .insert({
                student_email: cleanEmail,
                event_id: eventData.id
              });
            assignCount++;
          }
        }
        
        // ★結果を詳細に表示
        setStatus(`✅ 完了！ イベント登録: ${eventCount}件 / 学生への割り当て: ${assignCount}件`);
        alert(`登録成功！\nイベント: ${eventCount}件\n学生への割り当て: ${assignCount}件`);
        
        fetchEvents(); 
        e.target.value = '';

      } catch (error: any) {
        console.error(error);
        setStatus(`❌ エラー詳細: ${error.message || JSON.stringify(error)}`);
      }
    };
    reader.readAsBinaryString(file);
  };

  if (loading) return <div className="p-8">確認中...</div>;
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="bg-white p-8 rounded shadow">
          <h1 className="text-2xl font-bold mb-4">事務局用データ登録</h1>
          <p className="mb-4 text-sm text-gray-600">
            Excel形式: イベント名, 日付, 集合時間, プログラム名, 集合場所, メールアドレス
          </p>
          <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
          {/* ステータス表示エリア */}
          {status && <div className={`mt-4 p-3 rounded font-bold ${status.includes('❌') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{status}</div>}
        </div>
        
        <div className="bg-white p-8 rounded shadow">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">登録済みイベント一覧</h2>
            <button onClick={fetchEvents} className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded">更新</button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="p-3">日付</th>
                  <th className="p-3">時間</th>
                  <th className="p-3">PG</th>
                  <th className="p-3">イベント名</th>
                  <th className="p-3">場所</th>
                  <th className="p-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {events.length === 0 ? (
                  <tr><td colSpan={6} className="p-4 text-center text-gray-500">データがありません</td></tr>
                ) : (
                  events.map((event) => (
                    <tr key={event.id} className="hover:bg-gray-50">
                      <td className="p-3 font-mono">{event.date}</td>
                      <td className="p-3 font-mono">{event.meeting_time?.slice(0, 5)}</td>
                      <td className="p-3"><span className="bg-gray-100 px-2 py-1 rounded text-xs">{event.program_name}</span></td>
                      <td className="p-3 font-bold text-gray-800">{event.title}</td>
                      <td className="p-3 text-gray-600">{event.meeting_place}</td>
                      <td className="p-3 text-center">
                        <button onClick={() => handleDelete(event.id, event.title)} className="bg-red-100 text-red-600 hover:bg-red-200 px-3 py-1 rounded text-xs font-bold transition-colors">削除</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}