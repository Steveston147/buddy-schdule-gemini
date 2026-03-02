// FILE: app/page.tsx
"use client";

import { useState, useEffect } from "react";
import { supabase } from "./utils/supabase"; // パスは環境に合わせて調整してください
import Link from "next/link";
import { 
  format, addMonths, startOfMonth, endOfMonth, 
  startOfWeek, endOfWeek, eachDayOfInterval, 
  isSameMonth, isToday, isSameDay, parseISO 
} from "date-fns";
import { ja } from "date-fns/locale";

export default function TopPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [newsList, setNewsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 本日から3ヶ月分の基準月を生成
  const today = new Date();
  const months = [today, addMonths(today, 1), addMonths(today, 2)];

  useEffect(() => {
    const fetchPublicData = async () => {
      // 最新のお知らせを3件取得
      const { data: news } = await supabase
        .from("news")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(3);
      setNewsList(news || []);

      // イベントを取得（公開用なので時間・場所などの詳細はツールチップに出すかはお好みで）
      const { data: evs } = await supabase
        .from("events")
        .select("id, title, date, program_name")
        .order("date", { ascending: true });
      setEvents(evs || []);
      
      setLoading(false);
    };
    fetchPublicData();
  }, []);

  // カレンダーの1ヶ月分を描画する関数
  const renderMonth = (monthDate: Date) => {
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 0 }); // 日曜始まり
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const dateFormat = "d";
    const days = eachDayOfInterval({ start: startDate, end: endDate });

    const weekDays = ["日", "月", "火", "水", "木", "金", "土"];

    return (
      <div key={monthDate.toString()} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <div className="text-center font-bold text-gray-700 mb-4">
          {format(monthStart, "yyyy年 M月", { locale: ja })}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2 text-gray-500">
          {weekDays.map((day, idx) => (
            <div key={day} className={idx === 0 ? "text-red-400" : idx === 6 ? "text-blue-400" : ""}>
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-sm">
          {days.map((day, idx) => {
            // この日のイベントを抽出
            const dayEvents = events.filter(e => isSameDay(parseISO(e.date), day));
            const isCurrentMonth = isSameMonth(day, monthStart);
            const isTodayDate = isToday(day);

            return (
              <div 
                key={day.toString()} 
                className={`relative py-2 min-h-[40px] flex flex-col items-center justify-start group cursor-default
                  ${!isCurrentMonth ? "text-gray-300" : "text-gray-700"}
                  ${isTodayDate ? "bg-orange-50 font-bold text-orange-600 rounded-full" : ""}
                `}
              >
                <span>{format(day, dateFormat)}</span>
                
                {/* イベントがある場合はカラードットを表示 */}
                {dayEvents.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {dayEvents.map((ev, i) => (
                      <div 
                        key={i} 
                        className="w-1.5 h-1.5 rounded-full bg-blue-500"
                        // プログラム名によって色を変える場合はここで条件分岐（例: ev.program_name === 'RSJP' ? 'bg-orange-500' : 'bg-blue-500'）
                      />
                    ))}
                  </div>
                )}

                {/* ホバー時のツールチップ（Tailwindのgroup-hoverを使用） */}
                {dayEvents.length > 0 && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[150px] p-2 bg-gray-800 text-white text-xs rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 pointer-events-none">
                    {dayEvents.map(ev => (
                      <div key={ev.id} className="truncate">
                        ・{ev.title}
                      </div>
                    ))}
                    {/* 吹き出しの三角部分 */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* ヒーローバナー */}
      <div className="relative h-64 bg-gray-800 flex flex-col items-center justify-center text-white text-center px-4 overflow-hidden">
        {/* ※実際の画像パス（/hero.jpgなど）に置き換えてください */}
        <div className="absolute inset-0 bg-[url('/your-hero-image.jpg')] bg-cover bg-center opacity-40"></div>
        <div className="relative z-10">
          <h1 className="text-4xl font-bold mb-2">Buddy Schedule</h1>
          <p className="text-lg">留学サポートデスク/短期留学生受入プログラム</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 -mt-8 relative z-20 space-y-8">
        
        {/* お知らせセクション */}
        <div className="bg-white p-6 rounded-lg shadow-md border-t-4 border-orange-400">
          <h2 className="text-sm font-bold text-gray-500 mb-4 flex items-center gap-2">
            📢 事務局からのお知らせ
          </h2>
          {loading ? (
            <p className="text-sm text-gray-400">読み込み中...</p>
          ) : newsList.length === 0 ? (
            <p className="text-sm text-gray-400">現在お知らせはありません。</p>
          ) : (
            <ul className="space-y-3">
              {newsList.map((news) => (
                <li key={news.id} className="text-sm text-gray-800 flex items-start gap-4">
                  <span className="text-orange-500 font-bold shrink-0">
                    {format(new Date(news.created_at), "yyyy/MM/dd")}
                  </span>
                  <span>{news.content}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 3ヶ月カレンダー＆ログインセクション */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
            📅 今後の予定リスト
          </h2>

          {loading ? (
            <p className="text-center py-8 text-gray-400">カレンダーを読み込んでいます...</p>
          ) : (
            <>
              {/* 3ヶ月カレンダーを横並び（スマホでは縦並び） */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {months.map(month => renderMonth(month))}
              </div>

              {/* ログイン誘導エリア */}
              <div className="border-t border-dashed pt-8 pb-4 text-center">
                <p className="text-gray-600 mb-4 text-sm">
                  スケジュールの詳細（集合時間・場所）や、あなたの担当シフトを確認するにはログインしてください。
                </p>
                <Link 
                  href="/login" 
                  className="inline-block bg-blue-600 text-white font-bold px-8 py-3 rounded-full hover:bg-blue-700 transition shadow-md hover:shadow-lg"
                >
                  ログイン画面へ
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}