'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const [schedules, setSchedules] = useState([]);
  const [userEmail, setUserEmail] = useState('');
  const router = useRouter();

  useEffect(() => {
    const fetchSchedules = async () => {
      // 1. ログインしているユーザーの情報を取得
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/'); // ログインしていなければログイン画面に戻す
        return;
      }
      setUserEmail(user.email);

      // 2. そのユーザーの割り当てデータを取得
      // assignmentsテーブルとeventsテーブルを連結して情報を取ってくる
      const { data, error } = await supabase
        .from('assignments')
        .select(`
          event_id,
          events (
            title,
            date,
            meeting_time,
            meeting_place
          )
        `)
        .eq('student_email', user.email);

      if (error) {
        console.error('データ取得エラー:', error);
      } else {
        setSchedules(data || []);
      }
    };

    fetchSchedules();
  }, [router]);

  // ログアウト処理
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h2>📅 マイ・スケジュール</h2>
        <button onClick={handleLogout} style={{ padding: '5px 10px' }}>ログアウト</button>
      </div>

      <p>ようこそ、{userEmail} さん</p>

      {schedules.length === 0 ? (
        <p>予定されている文化体験はありません。</p>
      ) : (
        <div style={{ display: 'grid', gap: '20px' }}>
          {schedules.map((item, index) => (
            <div key={index} style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
              <h3 style={{ margin: '0 0 10px 0', color: '#0070f3' }}>{item.events.title}</h3>
              <p><strong>日付:</strong> {item.events.date}</p>
              <p><strong>集合時間:</strong> {item.events.meeting_time}</p>
              <p><strong>集合場所:</strong> {item.events.meeting_place}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}