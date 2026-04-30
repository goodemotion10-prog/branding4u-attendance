'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import { useRouter } from 'next/navigation';
import Clock from '@/components/Clock';
import LeaveRequestModal from '@/components/LeaveRequestModal';
import AttendanceCalendar from '@/components/AttendanceCalendar';
import { format, startOfMonth, endOfMonth, differenceInMinutes } from 'date-fns';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [todayAttendance, setTodayAttendance] = useState<any>(null);
  const [myLeaveRequests, setMyLeaveRequests] = useState<any[]>([]);
  const [workLog, setWorkLog] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [totalWorkingMinutes, setTotalWorkingMinutes] = useState(0);

  const fetchTodayAttendance = useCallback(async () => {
    if (!user) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .single();
      
      if (data) {
        setTodayAttendance(data);
        if (data.work_log) setWorkLog(data.work_log);
      } else {
        setTodayAttendance(null);
      }

      // 내 휴가 내역 가져오기 (이번 달)
      const { data: leaves } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('request_date', { ascending: false });
      setMyLeaveRequests(leaves || []);

      // 이번 달 누적 근무 시간 계산 로직
      const startOfM = format(startOfMonth(new Date()), 'yyyy-MM-dd');
      const endOfM = format(endOfMonth(new Date()), 'yyyy-MM-dd');
      const { data: monthAtt } = await supabase
        .from('attendance')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', startOfM)
        .lte('date', endOfM)
        .not('check_out_time', 'is', null);

      if (monthAtt) {
        let totalMins = 0;
        monthAtt.forEach(att => {
          if (att.check_in_time && att.check_out_time) {
            totalMins += differenceInMinutes(new Date(att.check_out_time), new Date(att.check_in_time));
          }
        });
        setTotalWorkingMinutes(totalMins);
      }

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    fetchTodayAttendance();
  }, [user, router, fetchTodayAttendance]);

  const handleCheckIn = async () => {
    if (!user) return;
    setIsLoading(true);
    const today = format(new Date(), 'yyyy-MM-dd');
    
    try {
      const { error } = await supabase.from('attendance').insert([
        {
          user_id: user.id,
          date: today,
          check_in_time: new Date().toISOString(),
          status: 'present'
        }
      ]);
      
      if (error) throw error;
      await fetchTodayAttendance();
    } catch (error) {
      alert('출근 처리 중 오류가 발생했습니다.');
      setIsLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!user || !todayAttendance) return;
    if (!workLog.trim()) {
      alert('오늘의 업무 내용을 작성해주세요.');
      return;
    }
    
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('attendance')
        .update({
          check_out_time: new Date().toISOString(),
          work_log: workLog
        })
        .eq('id', todayAttendance.id);
        
      if (error) throw error;
      await fetchTodayAttendance();
      alert('퇴근 처리가 완료되었습니다. 수고하셨습니다!');
    } catch (error) {
      alert('퇴근 처리 중 오류가 발생했습니다.');
      setIsLoading(false);
    }
  };

  const handleUndoCheckOut = async () => {
    if (!user || !todayAttendance || !todayAttendance.check_out_time) return;
    
    // confirm 없이 즉시 실행 (테스트용)
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('attendance')
        .update({
          check_out_time: null
        })
        .eq('id', todayAttendance.id);
        
      if (error) throw error;
      await fetchTodayAttendance();
    } catch (error: any) {
      console.error('Undo error:', error);
      alert('취소 실패: ' + (error.message || '오류 발생'));
      setIsLoading(false);
    }
  };

  if (isLoading && !todayAttendance) {
    return <div className="flex-1 flex justify-center items-center text-gray-500">데이터를 불러오는 중...</div>;
  }

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-8">
        <div className="bg-brand-600 px-6 py-8 sm:p-10 text-center">
          <Clock />
          
          <div className="mt-4 text-white/90 text-sm font-medium bg-brand-700/50 inline-block px-4 py-2 rounded-full border border-brand-500/30 shadow-inner">
            이번 달 총 근무: <span className="font-bold text-white text-base ml-1">{Math.floor(totalWorkingMinutes / 60)}</span>시간 <span className="font-bold text-white text-base">{totalWorkingMinutes % 60}</span>분
          </div>
          
          <div className="mt-8 flex flex-col sm:flex-row justify-center items-center gap-4">
            {!todayAttendance?.check_in_time ? (
              <button
                onClick={handleCheckIn}
                disabled={isLoading}
                className="w-full sm:w-auto px-8 py-4 bg-white text-brand-600 text-lg font-bold rounded-xl shadow-md hover:bg-gray-50 transition-colors disabled:opacity-70"
              >
                출근하기
              </button>
            ) : (
              <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto items-center">
                <div className="px-8 py-4 bg-brand-700/50 text-white text-lg font-medium rounded-xl border border-brand-500/30">
                  출근 시간: {format(new Date(todayAttendance.check_in_time), 'HH:mm')}
                </div>
                {!todayAttendance.check_out_time ? (
                  <button
                    onClick={handleCheckOut}
                    disabled={isLoading}
                    className="w-full sm:w-auto px-8 py-4 bg-red-500 text-white text-lg font-bold rounded-xl shadow-md hover:bg-red-600 transition-colors disabled:opacity-70"
                  >
                    퇴근하기
                  </button>
                ) : (
                  <>
                    <div className="px-8 py-4 bg-gray-800/50 text-white text-lg font-medium rounded-xl border border-gray-600/30">
                      퇴근 시간: {format(new Date(todayAttendance.check_out_time), 'HH:mm')}
                    </div>
                    <button
                      onClick={handleUndoCheckOut}
                      disabled={isLoading}
                      className="text-white/70 hover:text-white text-sm underline transition-colors"
                    >
                      퇴근 취소
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
            <span className="bg-brand-100 text-brand-600 w-8 h-8 rounded-lg flex items-center justify-center mr-3">📝</span>
            오늘의 업무
          </h2>
          <p className="text-sm text-gray-500 mb-4">퇴근 전 반드시 오늘 진행한 업무 내용을 작성해주세요.</p>
          <textarea
            rows={6}
            value={workLog}
            onChange={(e) => setWorkLog(e.target.value)}
            disabled={!!todayAttendance?.check_out_time}
            className="w-full border border-gray-200 rounded-xl p-4 focus:ring-brand-500 focus:border-brand-500 text-gray-700 bg-gray-50"
            placeholder="1. 오전: 주간 회의 참석&#13;&#10;2. 오후: 프로젝트 A 기획안 작성..."
          />
          {todayAttendance?.check_out_time && (
            <p className="mt-2 text-sm text-green-600 font-medium">✅ 오늘의 업무가 기록되었습니다.</p>
          )}
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
            <span className="bg-brand-100 text-brand-600 w-8 h-8 rounded-lg flex items-center justify-center mr-3">✈️</span>
            휴가 신청
          </h2>
          <p className="text-sm text-gray-500 mb-6">조퇴, 반차, 월차 등 휴가가 필요한 경우 미리 신청해주세요.</p>
          
          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 font-medium hover:border-brand-500 hover:text-brand-600 hover:bg-brand-50 transition-all flex justify-center items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            휴가/조퇴 신청하기
          </button>
        </div>
      </div>

      {/* 내 휴가 신청 내역 추가 */}
      <div className="mt-8 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
          <span className="bg-brand-100 text-brand-600 w-8 h-8 rounded-lg flex items-center justify-center mr-3">📅</span>
          나의 휴가 신청 현황
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                <th className="pb-3">날짜</th>
                <th className="pb-3">유형</th>
                <th className="pb-3">상태</th>
                <th className="pb-3">사유</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {myLeaveRequests.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-sm text-gray-400">신청한 내역이 없습니다.</td>
                </tr>
              ) : (
                myLeaveRequests.map((req) => (
                  <tr key={req.id} className="text-sm">
                    <td className="py-3 text-gray-600">{req.request_date}</td>
                    <td className="py-3 text-gray-900">
                      {req.type === 'full_day' ? '월차' : req.type === 'half_day' ? '반차' : '조퇴'}
                    </td>
                    <td className="py-3">
                      {req.status === 'approved' ? (
                        <span className="text-green-600 font-medium">승인완료</span>
                      ) : req.status === 'rejected' ? (
                        <span className="text-red-500 font-medium">반려</span>
                      ) : (
                        <span className="text-amber-500 font-medium">대기중</span>
                      )}
                    </td>
                    <td className="py-3 text-gray-500 truncate max-w-[200px]">{req.reason}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
          <span className="bg-brand-100 text-brand-600 w-8 h-8 rounded-lg flex items-center justify-center mr-3">🗺️</span>
          전체 직원 캘린더
        </h2>
        <p className="text-sm text-gray-500 mb-4">날짜를 클릭하면 해당 날짜의 출근 및 휴가 현황을 볼 수 있습니다.</p>
        <div className="bg-gray-50 p-2 rounded-xl border border-gray-100">
          <AttendanceCalendar />
        </div>
      </div>

      <LeaveRequestModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={() => alert('신청이 완료되었습니다.')}
      />
    </div>
  );
}
