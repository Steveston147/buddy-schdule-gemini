// FILE: app/admin/page.tsx
// PATH: /app/admin/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../utils/supabase";
import * as XLSX from "xlsx";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [userStatus, setUserStatus] = useState("");
  const [defaultPassword, setDefaultPassword] = useState("Welcome2026");
  const [events, setEvents] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [newsList, setNewsList] = useState<any[]>([]);
  const [newsContent, setNewsContent] = useState("");

  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const router = useRouter();

  const fetchAllData = useCallback(async () => {
    const { data: ev } = await supabase.from("events").select("*").order("date");
    setEvents(ev || []);
    const { data: asg } = await supabase
      .from("assignments")
      .select("*, events(title, date)")
      .order("id", { ascending: false });
    setAssignments(asg || []);
    const { data: news } = await supabase.from("news").select("*").order("created_at", { ascending: false });
    setNewsList(news || []);
  }, []);

  useEffect(() => {
    const checkUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user && (user.email === "studenta@example.com" || user.email === "eltontanaka@gmail.com")) {
        setIsAdmin(true);
        fetchAllData();
      } else {
        alert("管理者権限がありません");
        router.push("/");
      }
      setLoading(false);
    };
    checkUser();
  }, [router, fetchAllData]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  // ------------------------------------------------------------
  // テンプレDL（XLSX生成）
  // ------------------------------------------------------------
  const downloadXlsxTemplate = (
    filename: string,
    sheetName: string,
    aoa: (string | number)[][],
    colWidths?: number[]
  ) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (colWidths && colWidths.length) {
      (ws as any)["!cols"] = colWidths.map((wch) => ({ wch }));
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
  };

  const handleDownloadUserTemplate = () => {
    const header = ["メールアドレス", "氏名"];
    const sample = [
      ["student1@example.com", "山田 太郎"],
      ["student2@example.com", "佐藤 花子"],
    ];
    downloadXlsxTemplate("user_accounts_template.xlsx", "users", [header, ...sample], [32, 18]);
  };

  // ★ ここで「終了時間」を追加
  const handleDownloadScheduleTemplate = () => {
    const header = ["イベント名", "日付", "集合時間", "終了時間", "集合場所", "プログラム名", "メールアドレス"];
    const sample = [
      ["日本語講座", "2026-02-10", "09:00", "10:30", "OIC 〇〇教室", "RSJP", "student1@example.com"],
      ["日本語講座", "2026-02-10", "09:00", "10:30", "OIC 〇〇教室", "RSJP", "student2@example.com"],
      ["日本文化体験", "2026-02-10", "13:00", "16:00", "南門前", "RSJP Exp", "student1@example.com"],
    ];
    downloadXlsxTemplate("schedule_template.xlsx", "schedule", [header, ...sample], [22, 14, 10, 10, 22, 14, 32]);
  };
  // ------------------------------------------------------------

  // ユーザー一括登録
  const handleUserUpload = async (e: any) => {
    const file = e.target.files[0];
    if (!file) return;

    if (
      !confirm(
        `初期パスワード「${defaultPassword}」でユーザーを一括登録しますか？\n（すでに登録済みの人はスキップされます）`
      )
    ) {
      e.target.value = "";
      return;
    }

    setUserStatus("登録処理中...（時間がかかります）");

    const reader = new FileReader();
    reader.onload = async (evt: any) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[] = XLSX.utils.sheet_to_json(ws);

        const response = await fetch("/api/create-users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ users: data, defaultPassword }),
        });

        const result = await response.json();

        if (response.ok) {
          const successCount = result.results.filter((r: any) => r.status === "Success").length;
          const errorCount = result.results.filter((r: any) => r.status === "Error").length;
          setUserStatus(`完了！ 成功:${successCount} / エラー(済):${errorCount}`);
          alert(`登録完了\n成功: ${successCount}件\nエラー（登録済など）: ${errorCount}件`);
        } else {
          setUserStatus(`エラー: ${result.error}`);
        }
      } catch (error: any) {
        setUserStatus(`エラー: ${error.message}`);
      }
      e.target.value = "";
    };
    reader.readAsBinaryString(file);
  };

  // お知らせ
  const handleAddNews = async (e: any) => {
    e.preventDefault();
    if (!newsContent.trim()) return;
    const { error } = await supabase.from("news").insert({ content: newsContent });
    if (error) alert("投稿エラー: " + error.message);
    else {
      setNewsContent("");
      fetchAllData();
    }
  };
  const handleDeleteNews = async (id: number) => {
    if (!confirm("削除しますか？")) return;
    await supabase.from("news").delete().eq("id", id);
    fetchAllData();
  };

  const handleDeleteEvent = async (id: number) => {
    if (!confirm("本当に削除しますか？")) return;
    await supabase.from("events").delete().eq("id", id);
    fetchAllData();
  };
  const handleResetAll = async () => {
    if (!confirm("【危険】全データ削除しますか？")) return;
    await supabase.from("assignments").delete().neq("id", 0);
    await supabase.from("events").delete().neq("id", 0);
    alert("初期化しました");
    fetchAllData();
  };

  const openAttendanceModal = (event: any) => {
    setSelectedEvent(event);
    setIsModalOpen(true);
  };
  const closeAttendanceModal = () => {
    setSelectedEvent(null);
    setIsModalOpen(false);
  };

  // スケジュール登録（events upsert + assignments insert）
  const handleFileUpload = async (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    setStatus("読み込み中...");

    const reader = new FileReader();
    reader.onload = async (evt: any) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[] = XLSX.utils.sheet_to_json(ws, { raw: false });

        let evCount = 0;
        let asCount = 0;

        const getVal = (row: any, key: string) => {
          if (row[key] !== undefined) return row[key];
          const k = Object.keys(row).find((x) => x.replace(/\s+/g, "") === key);
          return k ? row[k] : undefined;
        };

        for (const row of data) {
          const title = getVal(row, "イベント名");
          const date = getVal(row, "日付");
          const time = getVal(row, "集合時間");
          const endTime = getVal(row, "終了時間"); // ★追加
          const place = getVal(row, "集合場所");
          const program = getVal(row, "プログラム名");
          const email = getVal(row, "メールアドレス");

          if (!title || !date) continue;

          const { data: eventData, error: evError } = await supabase
            .from("events")
            .upsert(
              {
                title,
                date,
                meeting_time: time,
                end_time: endTime || null, // ★追加
                meeting_place: place,
                program_name: program,
              },
              { onConflict: "title, date" }
            )
            .select()
            .single();

          if (evError) throw evError;
          evCount++;

          if (eventData && email) {
            const { error: asError } = await supabase
              .from("assignments")
              .insert({ student_email: String(email).trim(), event_id: eventData.id });
            if (!asError) asCount++;
          }
        }

        setStatus(`完了！ イベント:${evCount}件 / 割り当て:${asCount}件`);
        alert(`登録完了！\nイベント: ${evCount}件\n割り当て: ${asCount}件`);
        fetchAllData();
        e.target.value = "";
      } catch (error: any) {
        setStatus(`エラー: ${error.message}`);
      }
    };
    reader.readAsBinaryString(file);
  };

  if (loading) return <div className="p-8">確認中...</div>;
  if (!isAdmin) return null;

  const filteredAssignments = selectedEvent ? assignments.filter((a) => a.event_id === selectedEvent.id) : [];

  return (
    <div className="min-h-screen bg-gray-50 p-6 relative">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex justify-between items-center bg-white p-4 rounded shadow">
          <h1 className="text-xl font-bold text-gray-800">事務局管理画面</h1>
          <button
            onClick={handleLogout}
            className="text-sm bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
          >
            ログアウト
          </button>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-orange-400">
          <h2 className="text-lg font-bold text-gray-800 mb-4">📢 お知らせ・緊急連絡の投稿</h2>
          <form onSubmit={handleAddNews} className="flex gap-4">
            <input
              type="text"
              value={newsContent}
              onChange={(e) => setNewsContent(e.target.value)}
              placeholder="例：【重要】連絡事項"
              className="flex-1 p-3 border rounded shadow-sm"
            />
            <button type="submit" className="bg-orange-500 text-white px-6 py-2 rounded font-bold hover:bg-orange-600">
              投稿
            </button>
          </form>

          <div className="mt-4 space-y-2">
            {newsList.map((news) => (
              <div key={news.id} className="flex justify-between items-center bg-orange-50 p-3 rounded">
                <span className="text-sm text-gray-800">{news.content}</span>
                <button onClick={() => handleDeleteNews(news.id)} className="text-xs text-red-500 underline">
                  削除
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ユーザー登録 */}
        <div className="bg-white p-6 rounded-lg shadow border border-purple-100">
          <h2 className="text-lg font-bold text-purple-800 mb-2">② ユーザーアカウント一括作成</h2>
          <p className="text-sm text-gray-500 mb-4">
            学生名簿のExcelをアップロードすると、Supabaseにログイン用アカウントを作成します。<br />
            Excelには<strong>「メールアドレス」</strong>という列が必要です。（任意で「氏名」もOK）
          </p>

          <div className="flex items-center gap-4 mb-4">
            <label className="text-sm font-bold text-gray-700">初期パスワード設定:</label>
            <input
              type="text"
              value={defaultPassword}
              onChange={(e) => setDefaultPassword(e.target.value)}
              className="border p-2 rounded w-48 text-center font-mono"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              type="file"
              accept=".xlsx"
              onChange={handleUserUpload}
              className="flex-1 block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
            />
            <button
              type="button"
              onClick={handleDownloadUserTemplate}
              className="shrink-0 inline-flex items-center justify-center px-4 py-2 rounded-full border border-purple-200 bg-white text-purple-700 font-bold hover:bg-purple-50"
            >
              テンプレDL
            </button>
          </div>

          {userStatus && <p className="mt-2 font-bold text-purple-600">{userStatus}</p>}
        </div>

        {/* スケジュール登録 */}
        <div className="bg-white p-6 rounded-lg shadow border border-blue-100">
          <h2 className="text-lg font-bold text-gray-800 mb-2">① スケジュールデータ登録</h2>
          <p className="text-sm text-gray-500 mb-4">
            Excelには<strong>「終了時間」</strong>列も追加できます（任意）。未入力の場合はカレンダー出力で「開始＋60分」の暫定になります。
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              type="file"
              accept=".xlsx"
              onChange={handleFileUpload}
              className="flex-1 block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <button
              type="button"
              onClick={handleDownloadScheduleTemplate}
              className="shrink-0 inline-flex items-center justify-center px-4 py-2 rounded-full border border-blue-200 bg-white text-blue-700 font-bold hover:bg-blue-50"
            >
              テンプレDL
            </button>
          </div>

          {status && <p className="mt-2 font-bold text-blue-600">{status}</p>}
        </div>

        {/* イベント一覧 */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">登録済みイベント一覧</h2>
            <button onClick={handleResetAll} className="bg-red-100 text-red-600 px-4 py-2 rounded font-bold hover:bg-red-200">
              🗑️ 全データ削除
            </button>
          </div>
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2">日付</th>
                <th className="p-2">イベント名</th>
                <th className="p-2">PG</th>
                <th className="p-2 text-center">出席簿</th>
                <th className="p-2 text-center">削除</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b hover:bg-gray-50">
                  <td className="p-2">{e.date}</td>
                  <td className="p-2 font-bold">{e.title}</td>
                  <td className="p-2">
                    <span className="bg-gray-100 px-1 rounded text-xs">{e.program_name}</span>
                  </td>
                  <td className="p-2 text-center">
                    <button
                      onClick={() => openAttendanceModal(e)}
                      className="bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1 rounded text-xs font-bold transition"
                    >
                      📋 確認
                    </button>
                  </td>
                  <td className="p-2 text-center">
                    <button onClick={() => handleDeleteEvent(e.id)} className="text-red-500 hover:underline text-xs">
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 出席簿モーダル */}
      {isModalOpen && selectedEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={closeAttendanceModal}>
          <div className="bg-white w-full max-w-2xl rounded-lg shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-blue-600 p-4 text-white flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold">{selectedEvent.title}</h3>
                <p className="text-sm opacity-90">
                  {selectedEvent.date} @ {selectedEvent.meeting_place}
                </p>
              </div>
              <button onClick={closeAttendanceModal} className="text-2xl leading-none hover:text-gray-200">
                ×
              </button>
            </div>
            <div className="p-0 max-h-[70vh] overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 border-b text-gray-500">
                  <tr>
                    <th className="p-3">学生メールアドレス</th>
                    <th className="p-3">ステータス</th>
                    <th className="p-3">備考・欠席理由</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredAssignments.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-gray-400">
                        参加予定の学生はいません
                      </td>
                    </tr>
                  ) : (
                    filteredAssignments.map((asg) => (
                      <tr key={asg.id} className="hover:bg-gray-50">
                        <td className="p-3 font-mono text-gray-700">{asg.student_email}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-1 rounded text-xs font-bold border ${
                              asg.status === "出席"
                                ? "bg-green-100 text-green-700 border-green-200"
                                : asg.status === "欠席"
                                ? "bg-red-100 text-red-700 border-red-200"
                                : asg.status === "参加予定"
                                ? "bg-blue-100 text-blue-700 border-blue-200"
                                : "bg-gray-100 text-gray-500 border-gray-200"
                            }`}
                          >
                            {asg.status || "未登録"}
                          </span>
                        </td>
                        <td className="p-3">
                          {asg.absence_reason ? (
                            <span className="text-red-600 bg-red-50 px-2 py-1 rounded text-xs">{asg.absence_reason}</span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="bg-gray-50 p-3 text-right border-t">
              <button onClick={closeAttendanceModal} className="px-4 py-2 bg-white border rounded hover:bg-gray-100 text-sm">
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}