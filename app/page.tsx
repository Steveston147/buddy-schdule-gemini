// FILE: app/page.tsx
// PATH: /app/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "./utils/supabase";

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function icsEscape(s: string) {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function parseHHMM(t: string) {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return { hh: parseInt(m[1], 10), mm: parseInt(m[2], 10) };
}

function toIcsUtcStamp(dt: Date) {
  return (
    dt.getUTCFullYear() +
    pad2(dt.getUTCMonth() + 1) +
    pad2(dt.getUTCDate()) +
    "T" +
    pad2(dt.getUTCHours()) +
    pad2(dt.getUTCMinutes()) +
    pad2(dt.getUTCSeconds()) +
    "Z"
  );
}

function shiftYearMonth(year: number, month: number, offset: number) {
  const total = year * 12 + month + offset;
  const y = Math.floor(total / 12);
  let m = total % 12;
  if (m < 0) m += 12;
  return { year: y, month: m };
}

function addMinutesToHHMM(time: string, minutes: number) {
  const p = parseHHMM(time);
  if (!p) return null;
  const base = p.hh * 60 + p.mm + minutes;
  const hh = Math.floor(((base + 24 * 60) % (24 * 60)) / 60);
  const mm = (base + 24 * 60) % 60;
  return `${pad2(hh)}:${pad2(mm)}`;
}

function toGoogleDates(ymd: string, hhmm: string) {
  const d = ymd.replace(/-/g, "");
  const t = hhmm.replace(":", "") + "00";
  return `${d}T${t}`;
}

function fmtTimeRange(start: string, end: string) {
  const s = (start || "").slice(0, 5);
  const e = (end || "").slice(0, 5);
  if (s && e) return `${s}〜${e}`;
  if (s) return s;
  return "-";
}

export default function Home() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [newsList, setNewsList] = useState<any[]>([]);
  const [icsMsg, setIcsMsg] = useState<string | null>(null);

  const today = new Date();
  const [startYear, setStartYear] = useState(today.getFullYear());
  const [startMonth, setStartMonth] = useState(today.getMonth());

  const fetchMyEvents = async () => {
    setLoading(true);

    // お知らせ
    const { data: news } = await supabase.from("news").select("*").order("created_at", { ascending: false });
    setNewsList(news || []);

    // user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      setUserEmail("");
      setEvents([]);
      setLoading(false);
      return;
    }
    setUserEmail(user.email);

    // assignments
    const { data: myAssignments } = await supabase
      .from("assignments")
      .select("event_id, status, absence_reason")
      .eq("student_email", user.email);

    if (!myAssignments || myAssignments.length === 0) {
      setEvents([]);
      setLoading(false);
      return;
    }

    const eventIds = myAssignments.map((a: any) => a.event_id);

    // events（end_time含む）
    const { data: myEvents } = await supabase.from("events").select("*").in("id", eventIds).order("date", { ascending: true });

    const mergedEvents = (myEvents || []).map((event) => {
      const assignment = myAssignments.find((a: any) => a.event_id === event.id);
      return {
        ...event,
        status: assignment?.status || "未登録",
        absence_reason: assignment?.absence_reason || "",
      };
    });

    setEvents(mergedEvents);
    setLoading(false);
  };

  useEffect(() => {
    fetchMyEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedEvents = useMemo(() => {
    const copy = [...events];
    copy.sort((a, b) => {
      const ad = String(a?.date || "");
      const bd = String(b?.date || "");
      if (ad !== bd) return ad.localeCompare(bd);
      const at = String(a?.meeting_time || "");
      const bt = String(b?.meeting_time || "");
      return at.localeCompare(bt);
    });
    return copy;
  }, [events]);

  // カレンダーの点色
  const getEventColor = (title: string) => {
    const t = title || "";
    if (t.includes("日本文化")) return { dot: "bg-pink-500", bg: "bg-pink-50", border: "border-pink-200", text: "text-pink-900" };
    if (t.includes("日本語")) return { dot: "bg-blue-500", bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-900" };
    return { dot: "bg-green-500", bg: "bg-green-50", border: "border-green-200", text: "text-green-900" };
  };

  const changeStartMonth = (offset: number) => {
    const moved = shiftYearMonth(startYear, startMonth, offset);
    setStartYear(moved.year);
    setStartMonth(moved.month);
  };

  const monthsToShow = useMemo(() => {
    return [0, 1, 2].map((off) => shiftYearMonth(startYear, startMonth, off));
  }, [startYear, startMonth]);

  // 出欠更新
  const handleStatusUpdate = async (eventId: number, newStatus: string) => {
    let reason: string | null = null;

    if (newStatus === "欠席") {
      const inputReason = prompt("欠席理由を入力してください。\n（例：体調不良のため、授業のため）");
      if (inputReason === null) return;
      if (inputReason.trim() === "") {
        alert("欠席理由は必須です。");
        return;
      }
      reason = inputReason.trim();
    } else if (newStatus === "出席") {
      if (!confirm("会場に到着しましたか？\n「出席」として登録します。")) return;
    }

    const updateData: any = { status: newStatus };
    if (reason !== null) updateData.absence_reason = reason;

    const { error } = await supabase
      .from("assignments")
      .update(updateData)
      .eq("event_id", eventId)
      .eq("student_email", userEmail);

    if (error) {
      alert("更新に失敗しました");
      return;
    }

    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventId ? { ...e, status: newStatus, absence_reason: reason !== null ? reason : e.absence_reason } : e
      )
    );
  };

  // 1件Googleカレンダーへ
  const createCalendarLink = (event: any) => {
    const title = encodeURIComponent(event.title || "Buddy Schedule");
    const place = encodeURIComponent(event.meeting_place || "");
    const ymd = String(event.date || "");
    const start = String(event.meeting_time || "").slice(0, 5);
    const end = String(event.end_time || "").slice(0, 5);

    if (!ymd || !start) return "https://calendar.google.com";

    const startStr = toGoogleDates(ymd, start);
    let endStr = "";
    if (end) endStr = toGoogleDates(ymd, end);
    else {
      const tmp = addMinutesToHHMM(start, 60);
      endStr = toGoogleDates(ymd, tmp || start);
    }
    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&location=${place}&ctz=Asia%2FTokyo`;
  };

  // 全件ICS（end_time対応）
  const downloadAllAsICS = () => {
    setIcsMsg(null);

    if (!userEmail) {
      setIcsMsg("ユーザー情報が取得できません。再ログインしてください。");
      return;
    }
    if (!sortedEvents.length) {
      setIcsMsg("予定がありません。");
      return;
    }

    const DEFAULT_DURATION_MIN = 60;
    const now = new Date();
    const dtstamp = toIcsUtcStamp(now);

    const lines: string[] = [];
    lines.push("BEGIN:VCALENDAR");
    lines.push("VERSION:2.0");
    lines.push("PRODID:-//Buddy Schedule//JP");
    lines.push("CALSCALE:GREGORIAN");
    lines.push("METHOD:PUBLISH");
    lines.push(`X-WR-CALNAME:${icsEscape("Buddy Schedule")}`);

    for (const ev of sortedEvents) {
      if (!ev?.title || !ev?.date) continue;

      const title = String(ev.title);
      const date = String(ev.date);
      const startTime = String(ev.meeting_time || "").trim();
      const endTime = String(ev.end_time || "").trim();
      const place = String(ev.meeting_place || "").trim();
      const program = String(ev.program_name || "").trim();
      const status = String(ev.status || "").trim();
      const reason = String(ev.absence_reason || "").trim();

      const uid = `${userEmail}-${ev.id}@buddy-schedule`;

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${icsEscape(uid)}`);
      lines.push(`DTSTAMP:${dtstamp}`);

      const startHHMM = startTime ? parseHHMM(startTime) : null;
      const endHHMM = endTime ? parseHHMM(endTime) : null;

      if (!startHHMM) {
        // 終日
        const [y, m, d] = date.split("-").map((x: string) => parseInt(x, 10));
        const ymd = `${y}${pad2(m)}${pad2(d)}`;
        lines.push(`DTSTART;VALUE=DATE:${ymd}`);
        const next = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
        lines.push(`DTEND;VALUE=DATE:${next.getUTCFullYear()}${pad2(next.getUTCMonth() + 1)}${pad2(next.getUTCDate())}`);
      } else {
        // JST→UTC
        const [y, m, d] = date.split("-").map((x: string) => parseInt(x, 10));
        const startUtc = new Date(Date.UTC(y, m - 1, d, startHHMM.hh - 9, startHHMM.mm, 0));

        let endUtc: Date;
        if (endHHMM) {
          const tmpEnd = new Date(Date.UTC(y, m - 1, d, endHHMM.hh - 9, endHHMM.mm, 0));
          endUtc = tmpEnd.getTime() > startUtc.getTime() ? tmpEnd : new Date(startUtc.getTime() + DEFAULT_DURATION_MIN * 60 * 1000);
        } else {
          endUtc = new Date(startUtc.getTime() + DEFAULT_DURATION_MIN * 60 * 1000);
        }

        lines.push(`DTSTART:${toIcsUtcStamp(startUtc)}`);
        lines.push(`DTEND:${toIcsUtcStamp(endUtc)}`);
      }

      const summary = program ? `${title} (${program})` : title;
      lines.push(`SUMMARY:${icsEscape(summary)}`);
      if (place) lines.push(`LOCATION:${icsEscape(place)}`);

      const desc: string[] = [];
      if (program) desc.push(`Program: ${program}`);
      desc.push(`Date: ${date}`);
      if (startTime) desc.push(`Start: ${startTime} (JST)`);
      if (endTime) desc.push(`End: ${endTime} (JST)`);
      if (!endTime && startTime) desc.push(`End: +${DEFAULT_DURATION_MIN} minutes (temporary)`);
      if (place) desc.push(`Place: ${place}`);
      if (status) desc.push(`Status: ${status}`);
      if (reason) desc.push(`Reason: ${reason}`);
      desc.push("Generated by Buddy Schedule");
      lines.push(`DESCRIPTION:${icsEscape(desc.join("\n"))}`);

      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");

    const icsText = lines.join("\r\n");
    const blob = new Blob([icsText], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `buddy_schedule_${userEmail.replace(/[^a-zA-Z0-9._-]/g, "_")}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 3000);
    setIcsMsg("全予定の .ics をダウンロードしました（終了時刻も反映）。");
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* Hero */}
      <div className="relative w-full h-48 md:h-64 bg-gray-800 overflow-hidden shadow-md">
        <img
          src="https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&q=80&w=1200"
          alt="Kyoto Banner"
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white drop-shadow-md text-center px-4">
          <h1 className="text-3xl md:text-5xl font-bold tracking-wider mb-2">Buddy Schedule</h1>
          <p className="text-lg md:text-2xl font-bold opacity-90 mt-2">留学サポートデスク/短期留学生受入プログラム</p>
        </div>

        {userEmail ? (
          <div className="absolute top-4 right-4 flex items-center gap-3">
            <span className="text-xs text-white/90 bg-black/30 px-3 py-1 rounded-full backdrop-blur-sm">{userEmail}</span>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.reload();
              }}
              className="text-xs text-white hover:text-gray-200 underline"
            >
              ログアウト
            </button>
          </div>
        ) : (
          <a
            href="/login"
            className="absolute top-4 right-4 text-sm bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded backdrop-blur-md transition"
          >
            ログイン
          </a>
        )}
      </div>

      <div className="max-w-5xl mx-auto p-4 md:p-8">
        {/* News */}
        {newsList.length > 0 && (
          <div className="mb-8 bg-white border-l-4 border-orange-400 p-4 rounded shadow-sm">
            <h3 className="text-sm font-bold text-gray-500 mb-2">📢 事務局からのお知らせ</h3>
            <div className="space-y-2">
              {newsList.map((news) => (
                <div key={news.id} className="text-sm text-gray-800">
                  <span className="font-bold mr-2 text-orange-600">{new Date(news.created_at).toLocaleDateString()}</span>
                  {news.content}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-8">
          {/* ✅ ここが「一つ前に良かった」3か月カレンダー（点表示） */}
          {userEmail && (
            <aside className="w-full md:w-80 flex-shrink-0">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 sticky top-4">
                <div className="flex justify-between items-center mb-4">
                  <button onClick={() => changeStartMonth(-1)} className="p-1 hover:bg-gray-100 rounded text-gray-500">
                    ◀
                  </button>
                  <h2 className="text-base font-bold text-gray-800">
                    3か月カレンダー（{monthsToShow[0].year}年{monthsToShow[0].month + 1}月〜{monthsToShow[2].year}年{monthsToShow[2].month + 1}月）
                  </h2>
                  <button onClick={() => changeStartMonth(1)} className="p-1 hover:bg-gray-100 rounded text-gray-500">
                    ▶
                  </button>
                </div>

                <div className="space-y-6">
                  {monthsToShow.map((mObj, mi) => {
                    const y = mObj.year;
                    const m = mObj.month;

                    const daysInMonth = getDaysInMonth(y, m);
                    const firstDay = getFirstDayOfMonth(y, m);
                    const days: (number | null)[] = [];
                    for (let i = 0; i < firstDay; i++) days.push(null);
                    for (let i = 1; i <= daysInMonth; i++) days.push(i);

                    return (
                      <div key={`${y}-${m}-${mi}`} className="border-t pt-4 first:border-t-0 first:pt-0">
                        <div className="font-bold text-gray-800 mb-2">
                          {y}年 {m + 1}月
                        </div>

                        <div className="grid grid-cols-7 text-center text-xs text-gray-400 mb-2">
                          <span className="text-red-400">日</span>
                          <span>月</span>
                          <span>火</span>
                          <span>水</span>
                          <span>木</span>
                          <span>金</span>
                          <span className="text-blue-400">土</span>
                        </div>

                        <div className="grid grid-cols-7 gap-1 text-sm">
                          {days.map((day, idx) => {
                            if (!day) return <div key={idx} />;

                            const dateString = `${y}-${pad2(m + 1)}-${pad2(day)}`;
                            const dayEvents = sortedEvents.filter((e) => e.date === dateString);

                            return (
                              <div
                                key={idx}
                                className="h-10 flex flex-col items-center justify-center rounded hover:bg-gray-50 transition relative"
                              >
                                <span className={`${dayEvents.length > 0 ? "font-bold text-gray-800" : "text-gray-500"}`}>{day}</span>
                                <div className="flex gap-0.5 mt-0.5">
                                  {dayEvents.map((ev: any, i: number) => (
                                    <div key={i} className={`w-1.5 h-1.5 rounded-full ${getEventColor(String(ev.title || "")).dot}`} />
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </aside>
          )}

          {/* 予定リスト */}
          <main className="flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h3 className="text-xl font-bold text-gray-700 flex items-center gap-2">📅 今後の予定リスト</h3>

              {userEmail && (
                <button
                  onClick={downloadAllAsICS}
                  disabled={!sortedEvents.length}
                  className={`inline-flex items-center justify-center px-4 py-2 rounded-full border font-bold text-sm ${
                    sortedEvents.length ? "bg-white hover:bg-gray-50 border-gray-200 text-gray-700" : "bg-gray-100 border-gray-200 text-gray-400"
                  }`}
                  title="アサインされている予定をすべて .ics にしてダウンロード（Google/Outlookで取り込み可）"
                >
                  📥 全予定をICSでDL
                </button>
              )}
            </div>

            {icsMsg && (
              <div className="mb-4 text-sm font-bold text-blue-700 bg-blue-50 border border-blue-100 p-3 rounded">
                {icsMsg}
              </div>
            )}

            {!userEmail ? (
              <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
                <p className="mb-4 text-gray-600">スケジュールを確認するにはログインしてください。</p>
                <a
                  href="/login"
                  className="inline-block bg-blue-600 text-white font-bold py-3 px-8 rounded-full shadow-lg hover:bg-blue-700 transition"
                >
                  ログイン画面へ
                </a>
              </div>
            ) : sortedEvents.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-xl shadow-sm">
                <p className="text-gray-500 font-bold">予定はありません</p>
              </div>
            ) : (
              <div className="space-y-4">
                {sortedEvents.map((event) => {
                  const title = String(event.title || "");
                  const styles = getEventColor(title);

                  const isAttended = event.status === "出席";
                  const isAbsent = event.status === "欠席";
                  const isConfirmed = event.status === "参加予定";

                  const start = String(event.meeting_time || "").slice(0, 5);
                  const end = String(event.end_time || "").slice(0, 5);
                  const timeLabel = start ? fmtTimeRange(start, end) : "-";

                  return (
                    <div
                      key={event.id}
                      className={`p-5 rounded-xl border shadow-sm ${styles.bg} ${styles.border} ${styles.text} transition-all hover:translate-x-1`}
                    >
                      <div className="flex justify-between items-start mb-2 border-b border-black/5 pb-2">
                        <div>
                          <div className="text-lg font-bold">
                            {new Date(event.date).toLocaleDateString("ja-JP", { month: "short", day: "numeric", weekday: "short" })}
                          </div>
                          <div className="text-xl font-bold font-mono">{timeLabel}</div>
                        </div>

                        <div className={`px-3 py-1 rounded-full border text-xs font-bold bg-white`}>
                          {isAttended ? "出席済み ✅" : isAbsent ? "欠席 🏠" : isConfirmed ? "参加予定 👍" : "未回答"}
                        </div>
                      </div>

                      {event.program_name && (
                        <span className="inline-block bg-white/80 border border-black/10 text-xs font-bold px-2 py-1 rounded mb-2 text-gray-600">
                          {event.program_name}
                        </span>
                      )}

                      <h2 className="text-xl font-bold mb-3 leading-tight">{event.title}</h2>

                      {isAbsent && event.absence_reason && (
                        <div className="mb-4 bg-red-50 text-red-800 text-sm p-2 rounded border border-red-100">
                          理由: {event.absence_reason}
                        </div>
                      )}

                      <div className="flex items-center text-sm font-medium mb-4 opacity-80">
                        <span className="mr-2">📍 集合:</span>
                        <span>{event.meeting_place || "-"}</span>
                      </div>

                      <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-black/5">
                        {!isAttended && !isAbsent && (
                          <>
                            {!isConfirmed && (
                              <button
                                onClick={() => handleStatusUpdate(event.id, "参加予定")}
                                className="flex-1 py-2 px-3 rounded text-sm font-bold bg-blue-600 text-white shadow hover:bg-blue-700 transition"
                              >
                                参加予定（確認）👍
                              </button>
                            )}

                            {isConfirmed && (
                              <button
                                onClick={() => handleStatusUpdate(event.id, "出席")}
                                className="flex-1 py-2 px-3 rounded text-sm font-bold bg-green-600 text-white shadow hover:bg-green-700 transition animate-pulse"
                              >
                                出席チェックイン（当日）📍
                              </button>
                            )}

                            <button
                              onClick={() => handleStatusUpdate(event.id, "欠席")}
                              className="py-2 px-3 rounded text-sm font-bold bg-white border border-gray-300 text-gray-500 hover:bg-gray-100 transition"
                            >
                              欠席連絡
                            </button>
                          </>
                        )}

                        {isAttended && (
                          <div className="flex-1 py-2 px-3 text-center text-sm font-bold text-green-700 bg-green-50 rounded">
                            出席登録ありがとうございます！
                          </div>
                        )}

                        {isAbsent && (
                          <button
                            onClick={() => handleStatusUpdate(event.id, "参加予定")}
                            className="flex-1 py-2 px-3 text-center text-sm text-gray-400 underline hover:text-gray-600"
                          >
                            欠席を取り消す
                          </button>
                        )}

                        <a
                          href={createCalendarLink(event)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto inline-flex items-center text-xs bg-white/60 hover:bg-white/90 px-3 py-2 rounded border border-black/5 transition-colors text-black/70 font-bold"
                          title="この1件だけGoogleカレンダーに追加"
                        >
                          📅 カレンダー
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      </div>
fix
      <footer className="text-center py-8">
        <a href="/login" className="text-xs text-gray-400 hover:text-gray-600 underline">
          管理者ログイン
        </a>
      </footer>
    </div>
  );
}