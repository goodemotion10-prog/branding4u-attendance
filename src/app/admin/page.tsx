'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import AttendanceCalendar from '@/components/AttendanceCalendar';

export default function AdminPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState('attendance'); // 'attendance', 'leaves', 'users', 'calendar'
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user || user.role !== 'admin') return;
    setIsLoading(true);

    try {
      // 1. Fetch Attendance for the selected date
      const { data: attData } = await supabase
        .from('attendance')
        .select(`
          *,
          users (name, email)
        `)
        .eq('date', date);
      setAttendanceData(attData || []);

      // 2. Fetch ALL leave requests (to allow deleting approved ones)
      const { data: lrData } = await supabase
        .from('leave_requests')
        .select(`
          *,
          users (name, email)
        `)
        .order('request_date', { ascending: false });
      setLeaveRequests(lrData || []);

      // 3. Fetch pending users
      const { data: puData } = await supabase
        .from('users')
        .select('*')
        .eq('is_approved', false);
      setPendingUsers(puData || []);
      
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, date]);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'admin') {
      router.push('/dashboard');
      return;
    }
    fetchData();
  }, [user, router, fetchData, date]);

  const handleUpdateLeaveStatus = async (id: string, status: string) => {
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
      await fetchData();
    } catch (error) {
      alert('상태 업데이트에 실패했습니다.');
    }
  };

  const handleApproveUser = async (id: string) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ is_approved: true })
        .eq('id', id);
      if (error) throw error;
      await fetchData();
    } catch (error) {
      alert('사용자 승인에 실패했습니다.');
    }
  };

  const handleDeleteAttendance = async (id: string) => {
    // confirm 없이 테스트
    try {
      const { error } = await supabase
        .from('attendance')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await fetchData();
    } catch (error: any) {
      console.error('Delete error:', error);
      alert('삭제 실패: ' + (error.message || '오류 발생'));
    }
  };

  const handleDeleteLeave = async (id: string) => {
    try {
      const { error } = await supabase
        .from('leave_requests')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await fetchData();
    } catch (error: any) {
      console.error('Delete error:', error);
      alert('삭제 실패: ' + (error.message || '오류 발생'));
    }
  };

  if (isLoading && !attendanceData.length && !leaveRequests.length && !pendingUsers.length) {
    return <div className="flex-1 flex justify-center items-center text-gray-500">데이터를 불러오는 중...</div>;
  }

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">관리자 대시보드</h1>
          <p className="mt-2 text-sm text-gray-600">직원들의 근태 현황 및 결재 요청을 관리합니다.</p>
        </div>
        
        {/* 날짜 선택 (출결 탭에서만 활성화) */}
        {activeTab === 'attendance' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">조회 날짜</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-brand-500 focus:border-brand-500 sm:text-sm"
            />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('attendance')}
            className={`${activeTab === 'attendance' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
          >
            출결 현황
          </button>
          <button
            onClick={() => setActiveTab('leaves')}
            className={`${activeTab === 'leaves' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
          >
            휴가 관리
            {leaveRequests.filter(l => l.status === 'pending').length > 0 && (
              <span className="ml-2 bg-red-100 text-red-600 py-0.5 px-2 rounded-full text-xs">
                {leaveRequests.filter(l => l.status === 'pending').length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`${activeTab === 'users' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
          >
            직원 승인
            {pendingUsers.length > 0 && (
              <span className="ml-2 bg-red-100 text-red-600 py-0.5 px-2 rounded-full text-xs">
                {pendingUsers.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('calendar')}
            className={`${activeTab === 'calendar' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
          >
            전체 캘린더
          </button>
        </nav>
      </div>

      {/* Content */}
      <div className="bg-white shadow-sm rounded-xl border border-gray-100 overflow-hidden">
        {activeTab === 'attendance' && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">이름</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">출근 시간</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">퇴근 시간</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">오늘의 업무</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">관리</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {attendanceData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">해당 날짜의 출결 데이터가 없습니다.</td>
                  </tr>
                ) : (
                  attendanceData.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{item.users.name}</div>
                        <div className="text-sm text-gray-500">{item.users.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.check_in_time ? format(new Date(item.check_in_time), 'HH:mm') : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.check_out_time ? format(new Date(item.check_out_time), 'HH:mm') : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-md">
                        {item.work_log ? (
                          <div className="whitespace-pre-wrap">{item.work_log}</div>
                        ) : (
                          <span className="text-gray-400 italic">미작성</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleDeleteAttendance(item.id)}
                          className="text-red-400 hover:text-red-600 transition-colors"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'leaves' && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">신청자</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">유형</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">날짜</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">사유</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">처리</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {leaveRequests.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">대기 중인 휴가 신청이 없습니다.</td>
                  </tr>
                ) : (
                  leaveRequests.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{item.users.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {item.type === 'early_leave' && '조퇴'}
                        {item.type === 'half_day' && '반차'}
                        {item.type === 'full_day' && '월차 (연차)'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.request_date}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{item.reason}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        {item.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleUpdateLeaveStatus(item.id, 'approved')}
                              className="text-green-600 hover:text-green-900 font-bold"
                            >
                              승인
                            </button>
                            <button
                              onClick={() => handleUpdateLeaveStatus(item.id, 'rejected')}
                              className="text-red-600 hover:text-red-900 font-bold"
                            >
                              반려
                            </button>
                          </>
                        )}
                        {item.status !== 'pending' && (
                          <span className={`mr-4 ${item.status === 'approved' ? 'text-green-600' : 'text-red-400'}`}>
                            {item.status === 'approved' ? '승인됨' : '반려됨'}
                          </span>
                        )}
                        <button
                          onClick={() => handleDeleteLeave(item.id)}
                          className="text-gray-400 hover:text-red-600 transition-colors"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">이름</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">이메일</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">가입일</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">처리</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pendingUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">대기 중인 직원 가입이 없습니다.</td>
                  </tr>
                ) : (
                  pendingUsers.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{item.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(item.join_date), 'yyyy-MM-dd HH:mm')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleApproveUser(item.id)}
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-brand-600 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500"
                        >
                          가입 승인
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'calendar' && (
          <AttendanceCalendar />
        )}
      </div>
    </div>
  );
}
