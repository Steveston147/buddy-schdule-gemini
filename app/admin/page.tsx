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
  const [assignments, setAssignments] = useState<any[]>([]); // 割り当てリスト
  const [debugRows, setDebugRows] = useState<any[]>([]); // Excelの中身チェック用
  const router = useRouter();

  // イベントと割り当ての両方を読み込む
  const fetchAllData = useCallback(async () => {
    // イベント
    const { data: ev } = await supabase.from('events').select('*').order('date');
    setEvents(ev || []);

    // 割り当て（イベント情報もくっつけて取得）
    const { data: asg } = await supabase
      .from('assignments')
      .select('*, events(title, date)')
      .order('id', { ascending: false }); // 新しい順
    setAssignments(asg || []);
  }, []);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && (user.email === 'studenta@example.com' || user.email === 'eltontanaka@gmail.com')) {
        setIsAdmin(true);
        fetchAllData(); 
      } else {
        alert('管理者権限がありません');
        router.push('/');
      }
      setLoading(false);
    };
    checkUser();
  }, [router, fetchAllData]);

  const handleDeleteEvent = async (id: number) => {
    if (!confirm('本当に削除しますか？')) return;
    await supabase.from('events').delete().eq('id', id);
    fetchAllData();
  };

  const handleResetAll = async () => {
    if (!confirm('【危険】全てのイベントと割り当てデータを削除しますか？\nこの操作は戻せません！')) return;
    await supabase.from('assignments').delete().neq('id', 0); // 全削除
    await supabase.from('events').delete().neq('id', 0); // 全削除
    alert('初期化しました');
    fetchAllData();
  };

  // 柔軟な列名取得（スペース除去対応）
  const getColumnValue = (row: any, targetKey: string) => {
    if (row[targetKey] !== undefined) return row[targetKey];
    // キーに含まれるスペースを消して比較する
    const foundKey = Object.keys(row).find(k => k.replace(/\s+/g, '') === targetKey);
    return foundKey ? row[foundKey] : undefined;
  };

  const handleFileUpload = async (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    setStatus('読み込み中...');
    
    const reader = new FileReader();
    reader.onload = async (evt: any) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[] = XLSX.utils.sheet_to_json(ws, { raw: false }); // 文字列として読む

        // ★デバッグ用に最初の3行を表示
        setDebugRows(data.slice(0, 3));

        let evCount = 0;
        let asCount = 0;

        for (const row of data) {
          const title = getColumnValue(row, 'イベント名');
          const date = getColumnValue(row, '日付');
          const time = getColumnValue(row, '集合時間');
          const place = getColumnValue(row, '集合場所');
          const program = getColumnValue(row, 'プログラム名');
          const email = getColumnValue(row, 'メールアドレス');

          if (!title || !date) continue;

          // 1. イベント登録
          const { data: eventData, error: evError } = await supabase
            .from('events')
            .upsert({ 
              title: title, 
              date: date, 
              meeting_time: time, 
              meeting_place: place,
              program_name: program
            }, { onConflict: 'title, date' }) // タイトルと日付が同じなら更新扱い
            .select()
            .single();

          if (evError) throw evError;
          evCount++;

          // 2. 割り当て登録
          if (eventData && email) {
            const cleanEmail = String(email).trim(); // メールの前後のゴミを取る
            
            const { error: asError } = await supabase
              .from('assignments')
              .insert({ student_email: cleanEmail, event_id: eventData.id });
            
            if (!asError) asCount++;
          }
        }

        setStatus(`完了！ イベント:${evCount}件 / 割り当て:${asCount}件`);
        alert(`登録結果\nイベント登録数: ${evCount}\n学生への割り当て数: ${asCount}\n\n※もし割り当てが0件なら、下の「Excel読み取り診断」を見てください`);
        fetchAllData();
        e.target.value = '';

      } catch (error: any) {
        setStatus(`エラー: ${error.message}`);
        console.error(error);
      }
    };
    reader.readAsBinaryString(file);
  };

  if (loading) return <div>Checking...</div>;
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* アップロードエリア */}
        <div className="bg-white p-6 rounded-lg shadow border border-blue-100">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">① データ登録（診断モード）</h1>
          <p className="text-sm text-gray-500 mb-4">アップロードすると、下に「どう読み込まれたか」が表示されます。</p>
          <input type="file" accept=".xlsx" onChange={handleFileUpload} className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
          {status && <p className="mt-2 font-bold text-blue-600">{status}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* デバッグ表示エリア */}
          <div className="bg-gray-800 text-white p-4 rounded-lg shadow overflow-auto h-64">
             <h2 className="font-bold border-b border-gray-600 pb-2 mb-2">🔍 Excel読み取り診断（最初の3行）</h2>
             <pre className="text-xs font-mono whitespace-pre-wrap">
               {debugRows.length > 0 ? JSON.stringify(debugRows, null, 2) : 'ここに読み込んだデータの中身が表示されます'}
             </pre>
          </div>

          {/* 割り当てリスト表示エリア */}
          <div className="bg-white p-4 rounded-lg shadow overflow-auto h-64 border border-green-100">
            <h2 className="font-bold text-green-800 border-b pb-2 mb-2">📊 現在の割り当てリスト（DBの中身）</h2>
            {assignments.length === 0 ? <p className="text-gray-400 text-sm">データなし</p> : (
              <table className="w-full text-xs text-left">
                <thead><tr className="text-gray-500"><th>Email</th><th>イベント名</th><th>日付</th></tr></thead>
                <tbody>
                  {assignments.map((a: any) => (
                    <tr key={a.id} className="border-b">
                      <td className="py-1 font-mono">{a.student_email}</td>
                      <td className="py-1">{a.events?.title}</td>
                      <td className="py-1">{a.events?.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* イベント一覧 & リセットボタン */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">登録済みイベント一覧</h2>
            <button onClick={handleResetAll} className="bg-red-100 text-red-600 px-4 py-2 rounded font-bold hover:bg-red-200">🗑️ 全データ削除（リセット）</button>
          </div>
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-100"><tr><th className="p-2">日付</th><th className="p-2">イベント名</th><th className="p-2">PG</th><th className="p-2">削除</th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b hover:bg-gray-50">
                  <td className="p-2">{e.date}</td>
                  <td className="p-2 font-bold">{e.title}</td>
                  <td className="p-2"><span className="bg-gray-100 px-1 rounded text-xs">{e.program_name}</span></td>
                  <td className="p-2"><button onClick={() => handleDeleteEvent(e.id)} className="text-red-500 hover:underline">削除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}