// FILE: app/dashboard/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../utils/supabase';
import { useRouter } from 'next/navigation';
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isToday, isSameDay, parseISO
} from 'date-fns';
import { ja } from 'date-fns/locale';

type ScheduleRow = {
  id: number;
  event_id: number;
  status: string | null;
  absence_reason: string | null;
  events: {
    title: string | null;
    date: string | null;
    meeting_time: string | null;
    end_time: string | null;
    meeting_place: string | null;
    program_name?: string | null;
  } | null;
};

function pad2(n: number) { return String(n).padStart(2, '0'); }
function icsEscape(s: string) { return s.replace(/\\/g, '\\\\').replace(/\r\n|\n|\r/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
function ymdToParts(ymd: string) { const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10)); return { y, m, d }; }
function parseHHMM(t: string) { const m = t.match(/^(\d{1,2}):(\d{2})/); if (!m) return null; return { hh: parseInt(m[1], 10), mm: parseInt(m[2], 10) }; }
function toIcsUtcStamp(dt: Date) { return dt.getUTCFullYear() + pad2(dt.getUTCMonth() + 1) + pad2(dt.getUTCDate()) + 'T' + pad2(dt.getUTCHours()) + pad2(dt.getUTCMinutes()) + pad2(dt.getUTCSeconds()) + 'Z'; }

export default function DashboardPage() {
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState(''); // ★ NEW: 氏名を管理するState
  const [loading, setLoading] = useState(true);
  const [icsMsg, setIcsMsg] = useState<string | null>(null);

  const [baseDate, setBaseDate] = useState(new Date());
  const months = [baseDate, addMonths(baseDate, 1), addMonths(baseDate, 2)];
  const router = useRouter();

  useEffect(() => {
    const fetchSchedules = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user?.email) {
        router.push('/login');
        return;
      }
      setUserEmail(user.email);
      
      // ★ NEW: メタデータから氏名を取得（未登録なら空文字）
      setUserName(user.user_metadata?.name || user.user_metadata?.full_name || '');

      const { data, error } = await supabase
        .from('assignments')
        .select(`
          id,
          event_id,
          status,
          absence_reason,
          events (
            title,
            date,
            meeting_time,
            end_time,
            meeting_place,
            program_name
          )
        `)
        .eq('student_email', user.email);

      if (error) {
        console.error('データ取得エラー:', error);
        setSchedules([]);
      } else {
        setSchedules((data as any) || []);
      }
      setLoading(false);
    };

    fetchSchedules();
  }, [router]);

  const sortedSchedules = useMemo(() => {
    const copy = [...schedules];
    copy.sort((a, b) => {
      const ad = a.events?.date || '';
      const bd = b.events?.date || '';
      if (ad !== bd) return ad.localeCompare(bd);
      const at = a.events?.meeting_time || '';
      const bt = b.events?.meeting_time || '';
      return at.localeCompare(bt);
    });
    return copy;
  }, [schedules]);

  const handleStatusUpdate = async (assignmentId: number, newStatus: string) => {
    const { error } = await supabase
      .from('assignments')
      .update({ status: newStatus })
      .eq('id', assignmentId);

    if (error) {
      alert('ステータスの更新に失敗しました: ' + error.message);
    } else {
      setSchedules(prev => prev.map(s => s.id === assignmentId ? { ...s, status: newStatus } : s));
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleDownloadIcs = () => {
    setIcsMsg(null);
    if (!userEmail) return setIcsMsg('ユーザー情報が取得できませんでした。');
    if (!sortedSchedules.length) return setIcsMsg('ダウンロードできる予定がありません。');

    const dtstamp = toIcsUtcStamp(new Date());
    const DEFAULT_DURATION_MIN = 60;
    const lines: string[] = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Buddy Schedule//JP', 
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsEscape('Buddy Schedule')}`
    ];

    for (const row of sortedSchedules) {
      const ev = row.events;
      if (!ev?.title || !ev?.date) continue;
      
      const title = ev.title;
      const date = ev.date;
      const time = (ev.meeting_time || '').trim();
      const uidBase = `${userEmail}-${row.event_id}-${date}-${time || 'allday'}@buddy-schedule`;
      const hhmm = time ? parseHHMM(time) : null;

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${icsEscape(uidBase)}`);
      lines.push(`DTSTAMP:${dtstamp}`);

      if (!hhmm) {
        const { y, m, d } = ymdToParts(date);
        lines.push(`DTSTART;VALUE=DATE:${y}${pad2(m)}${pad2(d)}`);
        const next = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
        lines.push(`DTEND;VALUE=DATE:${next.getUTCFullYear()}${pad2(next.getUTCMonth() + 1)}${pad2(next.getUTCDate())}`);
      } else {
        const { y, m, d } = ymdToParts(date);
        const startUtc = new Date(Date.UTC(y, m - 1, d, hhmm.hh - 9, hhmm.mm, 0));
        let endUtc = new Date(startUtc.getTime() + DEFAULT_DURATION_MIN * 60 * 1000);
        if (ev.end_time) {
          const endHHMM = parseHHMM(ev.end_time);
          if (endHHMM) endUtc = new Date(Date.UTC(y, m - 1, d, endHHMM.hh - 9, endHHMM.mm, 0));
        }
        lines.push(`DTSTART:${toIcsUtcStamp(startUtc)}`);
        lines.push(`DTEND:${toIcsUtcStamp(endUtc)}`);
      }

      const summary = ev.program_name ? `${title} (${ev.program_name})` : title;
      lines.push(`SUMMARY:${icsEscape(summary)}`);
      if (ev.meeting_place) lines.push(`LOCATION:${icsEscape(ev.meeting_place)}`);
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');

    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `buddy_schedule_${userEmail.replace(/[^a-zA-Z0-9._-]/g, '_')}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const renderMonth = (monthDate: Date) => {
    const monthStart = startOfMonth(monthDate);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 0 });
    const endDate = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    return (
      <div key={monthDate.toString()} className="bg-white p-3 rounded-lg shadow-sm border border-gray-100 mb-4 transition-all">
        <div className="text-center font-bold text-gray-700 mb-2">{format(monthStart, "yyyy年 M月", { locale: ja })}</div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs mb-1 text-gray-500">
          {["日", "月", "火", "水", "木", "金", "土"].map((day, idx) => (
            <div key={day} className={idx === 0 ? "text-red-400" : idx === 6 ? "text-blue-400" : ""}>{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-sm">
          {days.map((day) => {
            const dayEvents = sortedSchedules.filter(s => s.events?.date && isSameDay(parseISO(s.events.date), day));
            const isCurrentMonth = isSameMonth(day, monthStart);
            
            return (
              <div key={day.toString()} className={`py-1.5 flex flex-col items-center justify-start ${!isCurrentMonth ? "text-gray-300" : "text-gray-700"} ${isToday(day) ? "bg-orange-50 font-bold text-orange-600 rounded-full" : ""}`}>
                <span>{format(day, "d")}</span>
                {dayEvents.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {dayEvents.map((ev, i) => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full ${ev.status === '出席' ? 'bg-green-500' : ev.status === '欠席' ? 'bg-red-500' : 'bg-blue-500'}`} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-500 font-bold">読み込み中...</p></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <span>📅</span> Buddy Schedule
          </h1>
          <div className="flex items-center gap-4">
            {/* ヘッダーにも名前を表示 */}
            <span className="text-sm text-gray-600 hidden sm:inline">
              {userName ? `${userName} さん` : userEmail}
            </span>
            <button onClick={handleLogout} className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-full font-bold transition">
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        
        {/* ★ NEW: 個人を強く認識させるウェルカムボード */}
        <div className="mb-8 bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-5">
          <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-2xl font-bold">
            {userName ? userName.charAt(0) : '👤'}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">
              ようこそ、<span className="text-blue-600">{userName || 'ゲスト'}</span> さん
            </h2>
            <p className="text-sm text-gray-500 mt-1">{userEmail}</p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
          <div>
            <h2 className="font-bold text-blue-900 mb-1">カレンダー連携</h2>
            <p className="text-xs text-blue-700">スマホのカレンダーアプリ（Google/iPhone等）に予定を一括追加できます。</p>
          </div>
          <button onClick={handleDownloadIcs} disabled={!sortedSchedules.length} className="shrink-0 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-2 px-6 rounded-full shadow-md transition">
            📥 .ics をダウンロード
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          
          <div className="w-full lg:w-1/3 shrink-0">
            <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
              <span>📍</span> あなたのスケジュール
            </h3>
            
            <div className="sticky top-24">
              <div className="flex items-center justify-between bg-white p-2 rounded-lg shadow-sm border border-gray-100 mb-4">
                <button 
                  onClick={() => setBaseDate(prev => subMonths(prev, 1))} 
                  className="px-3 py-2 text-sm text-gray-500 hover:bg-blue-50 hover:text-blue-600 rounded transition font-bold"
                >
                  ◀ 前月
                </button>
                <button 
                  onClick={() => setBaseDate(new Date())} 
                  className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded transition font-bold"
                >
                  今月に戻る
                </button>
                <button 
                  onClick={() => setBaseDate(prev => addMonths(prev, 1))} 
                  className="px-3 py-2 text-sm text-gray-500 hover:bg-blue-50 hover:text-blue-600 rounded transition font-bold"
                >
                  次月 ▶
                </button>
              </div>

              {months.map(month => renderMonth(month))}
              
              <div className="text-xs text-gray-500 mt-2 flex justify-center gap-4">
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"></div> 出席</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div> 欠席</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div> 未定</span>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-2/3">
            <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
              <span>📋</span> 詳細と出欠確認
            </h3>
            
            {sortedSchedules.length === 0 ? (
              <div className="bg-white p-8 rounded-xl text-center shadow-sm border border-gray-100">
                <p className="text-gray-500">現在、あなたに割り当てられた予定はありません。</p>
              </div>
            ) : (
              <div className="space-y-4">
                {sortedSchedules.map((row) => (
                  <div key={row.id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition group">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded font-bold">
                            {row.events?.program_name || '共通'}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded font-bold ${
                            row.status === '出席' ? 'bg-green-100 text-green-700' : 
                            row.status === '欠席' ? 'bg-red-100 text-red-700' : 
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {row.status || '未回答'}
                          </span>
                        </div>
                        <h4 className="text-lg font-bold text-gray-800 mb-3">{row.events?.title}</h4>
                        <div className="space-y-1 text-sm text-gray-600">
                          <p className="flex items-center gap-2"><span>🗓️</span> {row.events?.date}</p>
                          <p className="flex items-center gap-2"><span>⏰</span> 集合: <span className="font-bold text-gray-800">{row.events?.meeting_time || '未定'}</span></p>
                          <p className="flex items-center gap-2"><span>📍</span> 場所: {row.events?.meeting_place || '未定'}</p>
                        </div>
                      </div>

                      <div className="shrink-0 flex flex-row sm:flex-col gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 sm:border-l border-gray-100 sm:pl-4 mt-4 sm:mt-0">
                        <button 
                          onClick={() => handleStatusUpdate(row.id, '出席')}
                          className={`flex-1 sm:flex-none px-4 py-2 rounded font-bold text-sm border transition ${
                            row.status === '出席' 
                              ? 'bg-green-500 text-white border-green-500 shadow-inner' 
                              : 'bg-white text-gray-600 border-gray-300 hover:bg-green-50 hover:border-green-300 hover:text-green-600'
                          }`}
                        >
                          出席する
                        </button>
                        <button 
                          onClick={() => handleStatusUpdate(row.id, '欠席')}
                          className={`flex-1 sm:flex-none px-4 py-2 rounded font-bold text-sm border transition ${
                            row.status === '欠席' 
                              ? 'bg-red-500 text-white border-red-500 shadow-inner' 
                              : 'bg-white text-gray-600 border-gray-300 hover:bg-red-50 hover:border-red-300 hover:text-red-600'
                          }`}
                        >
                          欠席する
                        </button>
                      </div>

                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}