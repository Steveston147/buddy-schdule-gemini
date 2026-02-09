'use client';
import { useEffect, useState } from 'react';
import { supabase } from './utils/supabase';

export default function Home() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // データ読み込み
  useEffect(() => {
    const fetchEvents = async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('date', { ascending: true });

      if (error) console.error('エラー:', error);
      else setEvents(data || []);
      setLoading(false);
    };

    fetchEvents();
  }, []);

  // 🎨 色分けのルール
  const getEventStyle = (title: string) => {
    if (title.includes('日本文化')) {
      return 'bg-pink-50 border-pink-200 text-pink-900'; // 文化体験
    } else if (title.includes('日本語')) {
      return 'bg-blue-50 border-blue-200 text-blue-900'; // 日本語講座
    } else {
      return 'bg-green-50 border-green-200 text-green-900'; // その他
    }
  };

  // 📅 Googleカレンダー用リンク作成
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
      {/* ヘッダー */}
      <header className="bg-white shadow-sm p-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-center text-gray-800">
          Buddy Schedule 2026
        </h1>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4">
        {events.length === 0 ? (
          <p className="text-center text-gray-500 mt-10">予定はまだありません</p>
        ) : (
          events.map((event) => (
            <div 
              key={event.id} 
              className={`p-5 rounded-xl border shadow-sm ${getEventStyle(event.title)} transition-all`}
            >
              <div className="flex justify-between items-end mb-2 border-b border-black/10 pb-2">
                <span className="text-lg font-bold">
                  {new Date(event.date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}
                </span>
                <span className="text-xl font-bold font-mono">
                  {event.meeting_time.slice(0, 5)}
                </span>
              </div>

              <h2 className="text-xl font-bold mb-3 leading-tight">
                {event.title}
              </h2>

              <div className="flex items-center text-sm font-medium mb-4 opacity-80">
                <span className="mr-2">📍 集合:</span>
                <span>{event.meeting_place}</span>
              </div>

              <a 
                href={createCalendarLink(event)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-xs bg-white/60 hover:bg-white/90 px-3 py-2 rounded-lg border border-black/5 transition-colors text-black/70 font-bold"
              >
                📅 カレンダーに追加
              </a>
            </div>
          ))
        )}
      </main>

      {/* 管理者ログインへのリンク（ここに追加済み） */}
      <footer className="py-8 text-center">
        <a href="/login" className="text-xs text-gray-400 hover:text-gray-600 underline">
          管理者ログイン
        </a>
      </footer>

    </div>
  );
}