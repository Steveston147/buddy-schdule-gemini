'use client';
import { useEffect, useState } from 'react';
import { supabase } from './utils/supabase';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const router = useRouter();

  useEffect(() => {
    const fetchMyEvents = async () => {
      // 1. 今ログインしているのは誰？
      const { data: { user } } = await supabase.auth.getUser();

      if (!user || !user.email) {
        // ログインしていなければ終了（画面にはログインボタンを表示）
        setLoading(false);
        return;
      }

      setUserEmail(user.email);

      // 2. その人の「割り当て（assignments）」を探す
      // （ExcelのE列で指定したメールアドレスと一致するものを探す）
      const { data: myAssignments, error: assignError } = await supabase
        .from('assignments')
        .select('event_id')
        .eq('student_email', user.email);

      if (assignError) {
        console.error('割り当て取得エラー:', assignError);
        setLoading(false);
        return;
      }

      // 割り当てられたイベントのIDリストを作る
      const eventIds = myAssignments.map((a: any) => a.event_id);

      if (eventIds.length === 0) {
        setEvents([]); // 予定なし
        setLoading(false);
        return;
      }

      // 3. そのIDのイベント詳細データを持ってくる
      const { data: myEvents, error: eventError } = await supabase
        .from('events')
        .select('*')
        .in('id', eventIds) // IDリストに含まれるものだけ
        .order('date', { ascending: true });

      if (eventError) console.error('イベント取得エラー:', eventError);
      else setEvents(myEvents || []);
      
      setLoading(false);
    };

    fetchMyEvents();
  }, []);

  // 🎨 色分けのルール
  const getEventStyle = (title: string) => {
    if (title.includes('日本文化')) return 'bg-pink-50 border-pink-200 text-pink-900';
    if (title.includes('日本語')) return 'bg-blue-50 border-blue-200 text-blue-900';
    return 'bg-green-50 border-green-200 text-green-900';
  };

  // 📅 Googleカレンダー用リンク
  const createCalendarLink = (event: any) => {
    const dateStr = event.date.replace(/-/g, '');
    const timeStr = event.meeting_time.replace(':', '') + '00';
    const startDateTime = `${dateStr}T${timeStr}`;
    const endDateTime = `${dateStr}T${parseInt(timeStr) + 10000}`; 
    const url = new URL('https://www.google.com/calendar/render');
    url.searchParams.append('action', 'TEMPLATE');
    url.searchParams.append('text', event.title);
    url.searchParams.append('dates', `${startDateTime}/${endDateTime}`);
    url.searchParams.append('location', event.meeting_place || '');
    return url.toString();
  };

  if (loading) return <div className="p-8 text-center text-gray-500">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      <header className="bg-white shadow-sm p-4 sticky top-0 z-10 flex justify-between items-center">
        <h1 className="text-lg font-bold text-gray-800">Buddy Schedule</h1>
        {userEmail ? (
           <span className="text-xs text-gray-500">{userEmail} さん</span>
        ) : (
          <a href="/login" className="text-sm bg-blue-600 text-white px-3 py-1 rounded">ログイン</a>
        )}
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4">
        {!userEmail ? (
          <div className="text-center mt-20">
            <p className="mb-4 text-gray-600">スケジュールを確認するには<br/>ログインしてください。</p>
            <a href="/login" className="inline-block bg-blue-600 text-white font-bold py-3 px-8 rounded-full shadow-lg hover:bg-blue-700 transition">
              ログイン画面へ
            </a>
          </div>
        ) : events.length === 0 ? (
          <div className="text-center mt-10 p-8 bg-white rounded-xl shadow-sm">
            <p className="text-xl mb-2">🎉</p>
            <p className="text-gray-500 font-bold">現在の予定はありません</p>
            <p className="text-xs text-gray-400 mt-2">事務局からの割り当てをお待ちください</p>
          </div>
        ) : (
          events.map((event) => (
            <div key={event.id} className={`p-5 rounded-xl border shadow-sm ${getEventStyle(event.title)} transition-all`}>
              <div className="flex justify-between items-end mb-2 border-b border-black/10 pb-2">
                <span className="text-lg font-bold">
                  {new Date(event.date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}
                </span>
                <span className="text-xl font-bold font-mono">{event.meeting_time.slice(0, 5)}</span>
              </div>
              <h2 className="text-xl font-bold mb-3 leading-tight">{event.title}</h2>
              <div className="flex items-center text-sm font-medium mb-4 opacity-80">
                <span className="mr-2">📍 集合:</span>
                <span>{event.meeting_place}</span>
              </div>
              <a href={createCalendarLink(event)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-xs bg-white/60 hover:bg-white/90 px-3 py-2 rounded-lg border border-black/5 transition-colors text-black/70 font-bold">
                📅 カレンダーに追加
              </a>
            </div>
          ))
        )}
      </main>

      {/* フッター：ログアウト機能など */}
      {userEmail && (
        <footer className="py-8 text-center space-y-4">
          <button onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }} className="text-sm text-gray-500 underline">
            ログアウト
          </button>
          <div className="pt-2">
             <a href="/login" className="text-xs text-gray-300 hover:text-gray-400">管理者ログイン</a>
          </div>
        </footer>
      )}
    </div>
  );
}