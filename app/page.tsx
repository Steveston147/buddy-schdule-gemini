'use client';
import { useEffect, useState } from 'react';
import { supabase } from './utils/supabase';
import { useRouter } from 'next/navigation';

// カレンダー用のヘルパー関数
const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

export default function Home() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());

  useEffect(() => {
    const fetchMyEvents = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user || !user.email) {
        setLoading(false);
        return;
      }
      setUserEmail(user.email);

      const { data: myAssignments } = await supabase
        .from('assignments')
        .select('event_id')
        .eq('student_email', user.email);

      if (!myAssignments || myAssignments.length === 0) {
        setLoading(false);
        return;
      }

      const eventIds = myAssignments.map((a: any) => a.event_id);

      const { data: myEvents } = await supabase
        .from('events')
        .select('*')
        .in('id', eventIds)
        .order('date', { ascending: true });

      setEvents(myEvents || []);
      setLoading(false);
    };

    fetchMyEvents();
  }, []);

  const getEventColor = (title: string) => {
    if (title.includes('日本文化')) return { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-900', dot: 'bg-pink-500' };
    if (title.includes('日本語')) return { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-900', dot: 'bg-blue-500' };
    return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-900', dot: 'bg-green-500' };
  };

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const changeMonth = (offset: number) => {
    let newMonth = currentMonth + offset;
    let newYear = currentYear;
    if (newMonth < 0) { newMonth = 11; newYear--; }
    if (newMonth > 11) { newMonth = 0; newYear++; }
    setCurrentMonth(newMonth);
    setCurrentYear(newYear);
  };

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

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      
      {/* バナー */}
      <div className="relative w-full h-48 md:h-64 bg-gray-800 overflow-hidden shadow-md">
        <img 
          src="https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&q=80&w=1200" 
          alt="Kyoto Banner" 
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white drop-shadow-md">
          <h1 className="text-3xl md:text-4xl font-bold tracking-wider mb-2">Buddy Schedule</h1>
          <p className="text-sm md:text-base opacity-90 font-light">Ritsumeikan University 2026</p>
        </div>
        
        {userEmail ? (
          <div className="absolute top-4 right-4 flex items-center gap-3">
             <span className="text-xs text-white/90 bg-black/30 px-3 py-1 rounded-full backdrop-blur-sm">{userEmail}</span>
             <button onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }} className="text-xs text-white hover:text-gray-200 underline">ログアウト</button>
          </div>
        ) : (
          <a href="/login" className="absolute top-4 right-4 text-sm bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded backdrop-blur-md transition">ログイン</a>
        )}
      </div>

      <div className="max-w-5xl mx-auto p-4 md:p-8 flex flex-col md:flex-row gap-8">
        
        {/* カレンダー */}
        {userEmail && (
          <aside className="w-full md:w-80 flex-shrink-0">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 sticky top-4">
              <div className="flex justify-between items-center mb-4">
                <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-gray-100 rounded text-gray-500">◀</button>
                <h2 className="text-lg font-bold text-gray-800">{currentYear}年 {currentMonth + 1}月</h2>
                <button onClick={() => changeMonth(1)} className="p-1 hover:bg-gray-100 rounded text-gray-500">▶</button>
              </div>
              <div className="grid grid-cols-7 text-center text-xs text-gray-400 mb-2">
                <span className="text-red-400">日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span className="text-blue-400">土</span>
              </div>
              <div className="grid grid-cols-7 gap-1 text-sm">
                {days.map((day, idx) => {
                  if (!day) return <div key={idx}></div>;
                  const dateString = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dayEvents = events.filter(e => e.date === dateString);
                  return (
                    <div key={idx} className="h-10 flex flex-col items-center justify-center rounded hover:bg-gray-50 transition relative">
                      <span className={`${dayEvents.length > 0 ? 'font-bold text-gray-800' : 'text-gray-500'}`}>{day}</span>
                      <div className="flex gap-0.5 mt-0.5">
                        {dayEvents.map((ev, i) => (<div key={i} className={`w-1.5 h-1.5 rounded-full ${getEventColor(ev.title).dot}`}></div>))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        )}

        {/* イベントリスト（プログラム名表示追加！） */}
        <main className="flex-1">
          <h3 className="text-xl font-bold text-gray-700 mb-4 flex items-center gap-2">📅 今後の予定リスト</h3>

          {!userEmail ? (
            <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
              <p className="mb-4 text-gray-600">スケジュールを確認するにはログインしてください。</p>
              <a href="/login" className="inline-block bg-blue-600 text-white font-bold py-3 px-8 rounded-full shadow-lg hover:bg-blue-700 transition">ログイン画面へ</a>
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-xl shadow-sm">
              <p className="text-gray-500 font-bold">予定はありません</p>
            </div>
          ) : (
            <div className="space-y-4">
              {events.map((event) => {
                const styles = getEventColor(event.title);
                return (
                  <div key={event.id} className={`p-5 rounded-xl border shadow-sm ${styles.bg} ${styles.border} ${styles.text} transition-all hover:translate-x-1`}>
                    
                    {/* 日付・時間 */}
                    <div className="flex justify-between items-end mb-2 border-b border-black/5 pb-2">
                      <span className="text-lg font-bold">{new Date(event.date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', weekday: 'short' })}</span>
                      <span className="text-xl font-bold font-mono">{event.meeting_time.slice(0, 5)}</span>
                    </div>

                    {/* ★追加箇所：プログラム名バッジ */}
                    {event.program_name && (
                      <span className="inline-block bg-white/80 border border-black/10 text-xs font-bold px-2 py-1 rounded mb-2 text-gray-600">
                        {event.program_name}
                      </span>
                    )}

                    <h2 className="text-xl font-bold mb-3 leading-tight">{event.title}</h2>
                    <div className="flex items-center text-sm font-medium mb-4 opacity-80">
                      <span className="mr-2">📍 集合:</span>
                      <span>{event.meeting_place}</span>
                    </div>
                    <a href={createCalendarLink(event)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-xs bg-white/60 hover:bg-white/90 px-3 py-2 rounded-lg border border-black/5 transition-colors text-black/70 font-bold">
                      📅 カレンダーに追加
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
      
      <footer className="text-center py-8">
        <a href="/login" className="text-xs text-gray-400 hover:text-gray-600 underline">管理者ログイン</a>
      </footer>
    </div>
  );
}