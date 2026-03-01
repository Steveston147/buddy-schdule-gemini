// FILE: app/dashboard/page.tsx
// PATH: /app/dashboard/page.tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../utils/supabase';
import { useRouter } from 'next/navigation';

type ScheduleRow = {
  event_id: number;
  events: {
    title: string | null;
    date: string | null; // YYYY-MM-DD
    meeting_time: string | null; // "09:00" など
    meeting_place: string | null;
    program_name?: string | null;
  } | null;
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function icsEscape(s: string) {
  // iCalendar の基本エスケープ（\ , ; 改行）
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\n|\r/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function ymdToParts(ymd: string) {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  return { y, m, d };
}

function parseHHMM(t: string) {
  // "9:00" も "09:00" も許容
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return { hh: parseInt(m[1], 10), mm: parseInt(m[2], 10) };
}

function toIcsUtcStamp(dt: Date) {
  // YYYYMMDDTHHMMSSZ
  return (
    dt.getUTCFullYear() +
    pad2(dt.getUTCMonth() + 1) +
    pad2(dt.getUTCDate()) +
    'T' +
    pad2(dt.getUTCHours()) +
    pad2(dt.getUTCMinutes()) +
    pad2(dt.getUTCSeconds()) +
    'Z'
  );
}

export default function DashboardPage() {
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [userEmail, setUserEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [icsMsg, setIcsMsg] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    const fetchSchedules = async () => {
      setLoading(true);

      // 1) ログインユーザー
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.email) {
        router.push('/');
        return;
      }
      setUserEmail(user.email);

      // 2) 自分の割当（assignments + events）
      const { data, error } = await supabase
        .from('assignments')
        .select(
          `
          event_id,
          events (
            title,
            date,
            meeting_time,
            meeting_place,
            program_name
          )
        `
        )
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const handleDownloadIcs = () => {
    setIcsMsg(null);

    if (!userEmail) {
      setIcsMsg('ユーザー情報が取得できませんでした。再ログインしてください。');
      return;
    }

    if (!sortedSchedules.length) {
      setIcsMsg('ダウンロードできる予定がありません。');
      return;
    }

    const now = new Date();
    const dtstamp = toIcsUtcStamp(now);

    // 予定の長さ（終了時刻がDBに無いので暫定：60分）
    const DEFAULT_DURATION_MIN = 60;

    const lines: string[] = [];
    lines.push('BEGIN:VCALENDAR');
    lines.push('VERSION:2.0');
    lines.push('PRODID:-//Buddy Schedule//JP');
    lines.push('CALSCALE:GREGORIAN');
    lines.push('METHOD:PUBLISH');
    lines.push(`X-WR-CALNAME:${icsEscape('Buddy Schedule')}`);

    for (const row of sortedSchedules) {
      const ev = row.events;
      if (!ev?.title || !ev?.date) continue;

      const title = ev.title;
      const date = ev.date;
      const place = ev.meeting_place || '';
      const time = (ev.meeting_time || '').trim();
      const program = (ev.program_name || '').trim();

      const uidBase = `${userEmail}-${row.event_id}-${date}-${time || 'allday'}@buddy-schedule`;

      // meeting_time がある場合は「JSTとして」UTCに変換してZで出す（Google/Outlook互換が高い）
      // 無い場合は終日イベント
      const hhmm = time ? parseHHMM(time) : null;

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${icsEscape(uidBase)}`);
      lines.push(`DTSTAMP:${dtstamp}`);

      if (!hhmm) {
        // 終日
        const { y, m, d } = ymdToParts(date);
        const ymd = `${y}${pad2(m)}${pad2(d)}`;
        lines.push(`DTSTART;VALUE=DATE:${ymd}`);
        // 終日のDTENDは「翌日」を指定（iCal仕様）
        const next = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
        const y2 = next.getUTCFullYear();
        const m2 = next.getUTCMonth() + 1;
        const d2 = next.getUTCDate();
        lines.push(`DTEND;VALUE=DATE:${y2}${pad2(m2)}${pad2(d2)}`);
      } else {
        const { y, m, d } = ymdToParts(date);

        // JST(UTC+9) → UTCにするため、時刻から9時間引いたDate(UTC)を作る
        const startUtc = new Date(Date.UTC(y, m - 1, d, hhmm.hh - 9, hhmm.mm, 0));
        const endUtc = new Date(startUtc.getTime() + DEFAULT_DURATION_MIN * 60 * 1000);

        lines.push(`DTSTART:${toIcsUtcStamp(startUtc)}`);
        lines.push(`DTEND:${toIcsUtcStamp(endUtc)}`);
      }

      const summary = program ? `${title} (${program})` : title;
      lines.push(`SUMMARY:${icsEscape(summary)}`);

      if (place) lines.push(`LOCATION:${icsEscape(place)}`);

      const descParts: string[] = [];
      descParts.push(`Date: ${date}`);
      if (time) descParts.push(`Time: ${time} (JST)`);
      if (place) descParts.push(`Place: ${place}`);
      descParts.push('Generated by Buddy Schedule');
      lines.push(`DESCRIPTION:${icsEscape(descParts.join('\n'))}`);

      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');

    const icsText = lines.join('\r\n');
    const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    const safeEmail = userEmail.replace(/[^a-zA-Z0-9._-]/g, '_');
    a.download = `buddy_schedule_${safeEmail}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 3000);
    setIcsMsg('カレンダーファイル(.ics)をダウンロードしました。');
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
        <h2>📅 マイ・スケジュール</h2>
        <button onClick={handleLogout} style={{ padding: '5px 10px' }}>
          ログアウト
        </button>
      </div>

      <p>ようこそ、{userEmail} さん</p>

      {/* ★ NEW: ICSダウンロード */}
      <div style={{ margin: '14px 0 22px 0', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={handleDownloadIcs}
          disabled={loading || !sortedSchedules.length}
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid #ddd',
            background: loading || !sortedSchedules.length ? '#f3f4f6' : '#fff',
            cursor: loading || !sortedSchedules.length ? 'not-allowed' : 'pointer',
            fontWeight: 700,
          }}
          title="Outlook / Google Calendar に取り込める .ics を出力します"
        >
          📥 カレンダー(.ics)をダウンロード
        </button>

        <span style={{ color: '#6b7280', fontSize: '12px' }}>
          ※ 予定の終了時刻は未登録のため、暫定で「開始から60分」にしています（カレンダー側で調整可）
        </span>

        {icsMsg && <div style={{ width: '100%', marginTop: '6px', color: '#2563eb', fontWeight: 700 }}>{icsMsg}</div>}
      </div>

      {loading ? (
        <p>読み込み中...</p>
      ) : sortedSchedules.length === 0 ? (
        <p>予定されている文化体験はありません。</p>
      ) : (
        <div style={{ display: 'grid', gap: '20px' }}>
          {sortedSchedules.map((item, index) => (
            <div
              key={index}
              style={{
                border: '1px solid #ccc',
                padding: '15px',
                borderRadius: '8px',
                boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
              }}
            >
              <h3 style={{ margin: '0 0 10px 0', color: '#0070f3' }}>{item.events?.title}</h3>
              <p>
                <strong>日付:</strong> {item.events?.date}
              </p>
              <p>
                <strong>集合時間:</strong> {item.events?.meeting_time || '-'}
              </p>
              <p>
                <strong>集合場所:</strong> {item.events?.meeting_place || '-'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}