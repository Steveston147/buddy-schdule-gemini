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
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [icsMsg, setIcsMsg] = useState<string | null>(null);
  
  // ★ NEW: お知らせデータを保持するState
  const [newsList, setNewsList] = useState<any[]>([]);

  const [baseDate, setBaseDate] = useState(new Date());
  const months = [baseDate, addMonths(baseDate, 1), addMonths(baseDate, 2)];
  const router = useRouter();

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState({ type: '', message: '' });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      if (!user?.email) {
        router.push('/login');
        return;
      }
      setUserEmail(user.email);
      setUserName(user.user_metadata?.name || user.user_metadata?.full_name || '');

      // スケジュールの取得
      const { data: asgData, error: asgError } = await supabase
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

      if (asgError) {
        console.error('スケジュール取得エラー:', asgError);
        setSchedules([]);
      } else {
        setSchedules((asgData as any) || []);
      }

      // ★ NEW: お知らせの取得
      const { data: newsData, error: newsError } = await supabase
        .from('news')
        .select('*')
        .order('created_at', { ascending: false });

      if (!newsError && newsData) {
        setNewsList(newsData);
      }

      setLoading(false);
    };

    fetchData();
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

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: 'error', message: 'パスワードが一致しません。' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordStatus({ type: 'error', message: 'パスワードは6文字以上で入力してください。' });
      return;
    }

    setIsUpdatingPassword(true);
    setPasswordStatus({ type: '', message: '' });

    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) {
      setPasswordStatus({ type: 'error', message: '更新エラー: ' + error.message });
    } else {
      setPasswordStatus({ type: 'success', message: 'パスワードを更新しました！' });
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setIsPasswordModalOpen(false);
        setPasswordStatus({ type: '', message: '' });
      }, 1500);
    }
    setIsUpdatingPassword(false);
  };

  const closePasswordModal = () => {
    setIsPasswordModalOpen(false);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordStatus({ type: '', message: '' });
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
      <div key={monthDate.toString()} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-4 transition-all">
        <div className="text-center font-bold text-gray-700 mb-3 text-sm sm:text-base">{format(monthStart, "yyyy年 M月", { locale: ja })}</div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2 text-gray-500">
          {["日", "月", "火", "水", "木", "金", "土"].map((day, idx) => (
            <div key={day} className={idx === 0 ? "text-red-400" : idx === 6 ? "text-blue-400" : ""}>{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-sm">
          {days.map((day) => {
            const dayEvents = sortedSchedules.filter(s => s.events?.date && isSameDay(parseISO(s.events.date), day));
            const isCurrentMonth = isSameMonth(day, monthStart);
            
            return (
              <div key={day.toString()} className={`py-2 flex flex-col items-center justify-start ${!isCurrentMonth ? "text-gray-300" : "text-gray-700"} ${isToday(day) ? "bg-orange-50 font-bold text-orange-600 rounded-full" : ""}`}>
                <span>{format(day, "d")}</span>
                {dayEvents.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {dayEvents.map((ev, i) => (
                      <div key={i} className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${ev.status === '出席' ? 'bg-green-500' : ev.status === '欠席' ? 'bg-red-500' : 'bg-blue-500'}`} />
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
    <div className="min-h-screen bg-gray-50 pb-20 relative">
      <header className="bg-white shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-lg sm:text-xl font-bold text-gray-800 flex items-center gap-2 truncate">
            <span>📅</span> Buddy Schedule
          </h1>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <span className="text-sm text-gray-600 hidden sm:inline">
              {userName ? `${userName} さん` : userEmail}
            </span>
            <button 
              onClick={() => setIsPasswordModalOpen(true)}
              className="text-xs sm:text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 sm:px-4 sm:py-2.5 rounded-full font-bold transition active:scale-95 flex items-center gap-1"
            >
              <span>⚙️</span> <span className="hidden sm:inline">設定</span>
            </button>
            <button onClick={handleLogout} className="text-xs sm:text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 sm:px-4 sm:py-2.5 rounded-full font-bold transition active:scale-95">
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8">
        
        {/* ウェルカムボード */}
        <div className="mb-6 sm:mb-8 bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 sm:gap-5">
          <div className="w-12 h-12 sm:w-14 sm:h-14 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xl sm:text-2xl font-bold shrink-0">
            {userName ? userName.charAt(0) : '👤'}
          </div>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800 truncate">
              ようこそ、<span className="text-blue-600">{userName || 'ゲスト'}</span> さん
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 mt-1 truncate">{userEmail}</p>
          </div>
        </div>

        {/* ★ NEW: お知らせセクション（お知らせがある場合のみ表示） */}
        {newsList.length > 0 && (
          <div className="mb-6 sm:mb-8 bg-white p-5 sm:p-6 rounded-2xl shadow-sm border-t-4 border-orange-400">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <span>📢</span> 事務局からのお知らせ
            </h2>
            <ul className="space-y-3">
              {newsList.map((news) => (
                <li key={news.id} className="text-sm text-gray-800 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 bg-orange-50 p-3 sm:p-4 rounded-xl border border-orange-100">
                  <span className="text-orange-600 font-bold shrink-0">
                    {format(new Date(news.created_at), "yyyy/MM/dd")}
                  </span>
                  <span className="font-medium">{news.content}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* カレンダー連携 */}
        <div className="bg-blue-50 border border-blue-100 p-4 sm:p-5 rounded-2xl mb-6 sm:mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
          <div className="text-center sm:text-left w-full sm:w-auto">
            <h2 className="font-bold text-blue-900 mb-1 text-sm sm:text-base">カレンダー連携</h2>
            <p className="text-xs text-blue-700">スマホのカレンダーアプリに予定を一括追加できます。</p>
          </div>
          <button onClick={handleDownloadIcs} disabled={!sortedSchedules.length} className="w-full sm:w-auto shrink-0 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-3 sm:py-2.5 px-6 rounded-xl sm:rounded-full shadow-md transition active:scale-95 text-sm sm:text-base">
            📥 .ics をダウンロード
          </button>
        </div>

        {/* 2カラム構成 */}
        <div className="flex flex-col lg:flex-row gap-6 sm:gap-8">
          
          <div className="w-full lg:w-1/3 shrink-0">
            <h3 className="font-bold text-gray-700 mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
              <span>📍</span> あなたのスケジュール
            </h3>
            
            <div className="lg:sticky lg:top-24">
              <div className="flex items-center justify-between bg-white p-2 sm:p-3 rounded-xl shadow-sm border border-gray-100 mb-4">
                <button 
                  onClick={() => setBaseDate(prev => subMonths(prev, 1))} 
                  className="px-3 sm:px-4 py-3 sm:py-2 text-sm text-gray-500 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition font-bold active:bg-blue-100"
                >
                  ◀ 前月
                </button>
                <button 
                  onClick={() => setBaseDate(new Date())} 
                  className="px-3 sm:px-4 py-3 sm:py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition font-bold active:bg-gray-200"
                >
                  今月に戻る
                </button>
                <button 
                  onClick={() => setBaseDate(prev => addMonths(prev, 1))} 
                  className="px-3 sm:px-4 py-3 sm:py-2 text-sm text-gray-500 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition font-bold active:bg-blue-100"
                >
                  次月 ▶
                </button>
              </div>

              {months.map(month => renderMonth(month))}
              
              <div className="text-xs text-gray-500 mt-3 flex justify-center gap-5 sm:gap-4 bg-white p-3 rounded-xl border border-gray-100">
                <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-green-500"></div> 出席</span>
                <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-500"></div> 欠席</span>
                <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div> 未定</span>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-2/3">
            <h3 className="font-bold text-gray-700 mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
              <span>📋</span> 詳細と出欠確認
            </h3>
            
            {sortedSchedules.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl text-center shadow-sm border border-gray-100">
                <p className="text-gray-500 text-sm sm:text-base">現在、あなたに割り当てられた予定はありません。</p>
              </div>
            ) : (
              <div className="space-y-4 sm:space-y-5">
                {sortedSchedules.map((row) => (
                  <div key={row.id} className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition group">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5 sm:gap-4">
                      
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <span className="bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded-md font-bold">
                            {row.events?.program_name || '共通'}
                          </span>
                          <span className={`text-xs px-2.5 py-1 rounded-md font-bold ${
                            row.status === '出席' ? 'bg-green-100 text-green-700' : 
                            row.status === '欠席' ? 'bg-red-100 text-red-700' : 
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {row.status || '未回答'}
                          </span>
                        </div>
                        <h4 className="text-lg sm:text-xl font-bold text-gray-800 mb-4">{row.events?.title}</h4>
                        <div className="space-y-2 text-sm sm:text-base text-gray-600 bg-gray-50 p-3 sm:p-4 rounded-xl border border-gray-100">
                          <p className="flex items-center gap-2"><span>🗓️</span> {row.events?.date}</p>
                          <p className="flex items-center gap-2"><span>⏰</span> 集合: <span className="font-bold text-gray-800">{row.events?.meeting_time || '未定'}</span></p>
                          <p className="flex items-start gap-2"><span>📍</span> <span className="flex-1">場所: {row.events?.meeting_place || '未定'}</span></p>
                        </div>
                      </div>

                      <div className="shrink-0 flex flex-row sm:flex-col gap-3 pt-4 sm:pt-0 border-t sm:border-t-0 sm:border-l border-gray-100 sm:pl-5 mt-2 sm:mt-0">
                        <button 
                          onClick={() => handleStatusUpdate(row.id, '出席')}
                          className={`flex-1 sm:flex-none px-4 py-3 sm:py-2.5 rounded-xl font-bold text-sm sm:text-base border transition active:scale-95 ${
                            row.status === '出席' 
                              ? 'bg-green-500 text-white border-green-500 shadow-inner' 
                              : 'bg-white text-gray-600 border-gray-300 hover:bg-green-50 hover:border-green-300 hover:text-green-600'
                          }`}
                        >
                          出席する
                        </button>
                        <button 
                          onClick={() => handleStatusUpdate(row.id, '欠席')}
                          className={`flex-1 sm:flex-none px-4 py-3 sm:py-2.5 rounded-xl font-bold text-sm sm:text-base border transition active:scale-95 ${
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

      {isPasswordModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm" onClick={closePasswordModal}>
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <span>🔒</span> パスワード変更
                </h3>
                <button onClick={closePasswordModal} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
              </div>
              
              <form onSubmit={handlePasswordUpdate} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">新しいパスワード</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="6文字以上で入力"
                    className="w-full p-3 border rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">新しいパスワード（確認用）</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="もう一度入力してください"
                    className="w-full p-3 border rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                </div>

                {passwordStatus.message && (
                  <div className={`p-3 rounded-xl text-sm font-bold ${passwordStatus.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                    {passwordStatus.message}
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isUpdatingPassword}
                    className="w-full bg-gray-800 hover:bg-gray-900 text-white font-bold py-3 rounded-xl shadow-md transition active:scale-95 disabled:opacity-50"
                  >
                    {isUpdatingPassword ? '更新中...' : 'パスワードを更新する'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}