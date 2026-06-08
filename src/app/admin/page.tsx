'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import { useRouter } from 'next/navigation';
import { format, startOfMonth, endOfMonth, differenceInMinutes } from 'date-fns';
import AttendanceCalendar from '@/components/AttendanceCalendar';

const WorkLogCell = ({ workLog }: { workLog: string }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!workLog) {
    return <span className="text-gray-400 italic">미작성</span>;
  }

  const isLongText = workLog.length > 40 || workLog.includes('\n');

  return (
    <>
      <div 
        className={isLongText ? "cursor-pointer group" : ""}
        onClick={() => {
          if (isLongText) setIsModalOpen(true);
        }}
      >
        <div className={`whitespace-pre-wrap text-gray-600 leading-relaxed ${isLongText ? 'line-clamp-2' : ''}`}>
          {workLog}
        </div>
        {isLongText && (
          <div className="text-xs text-brand-600 mt-1.5 font-medium hover:text-brand-800">
            자세히 보기 ▾
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 transition-opacity" onClick={() => setIsModalOpen(false)}>
          <div 
            className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col transform transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50/50 rounded-t-xl">
              <h3 className="text-base font-semibold text-gray-900">오늘의 업무 상세</h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 focus:outline-none p-1 rounded-md hover:bg-gray-100 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <div className="whitespace-pre-wrap text-gray-700 text-sm leading-relaxed">
                {workLog}
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50/50 rounded-b-xl flex justify-end">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors shadow-sm"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default function AdminPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState('attendance'); // 'attendance', 'leaves', 'users', 'calendar', 'stats'
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [statsMonth, setStatsMonth] = useState(format(new Date(), 'yyyy-MM'));
  
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [statsData, setStatsData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Client Payments states
  const [clientPayments, setClientPayments] = useState<any[]>([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any | null>(null);
  
  // Payment Form states
  const [clientName, setClientName] = useState('');
  const [paymentDay, setPaymentDay] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMemo, setPaymentMemo] = useState('');

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
      
      // 4. Fetch month stats for all users based on selected statsMonth
      const [year, month] = statsMonth.split('-').map(Number);
      const targetDate = new Date(year, month - 1, 1);
      const startOfM = format(startOfMonth(targetDate), 'yyyy-MM-dd');
      const endOfM = format(endOfMonth(targetDate), 'yyyy-MM-dd');
      
      const { data: monthAtt } = await supabase
        .from('attendance')
        .select(`
          *,
          users (name, email)
        `)
        .gte('date', startOfM)
        .lte('date', endOfM)
        .not('check_out_time', 'is', null);

      if (monthAtt) {
        const statsMap: Record<string, {name: string, email: string, totalMins: number, count: number}> = {};
        monthAtt.forEach((att) => {
          if (!statsMap[att.user_id]) {
            statsMap[att.user_id] = { name: att.users.name, email: att.users.email, totalMins: 0, count: 0 };
          }
          if (att.check_in_time && att.check_out_time) {
            statsMap[att.user_id].totalMins += differenceInMinutes(new Date(att.check_out_time), new Date(att.check_in_time));
            statsMap[att.user_id].count += 1;
          }
        });
        setStatsData(Object.values(statsMap).sort((a, b) => b.totalMins - a.totalMins));
      }

      // 5. Fetch Client Payments (safe from non-existent table error)
      try {
        const { data: cpData, error: cpError } = await supabase
          .from('client_payments')
          .select('*')
          .order('payment_day', { ascending: true });
        if (!cpError) {
          setClientPayments(cpData || []);
        } else {
          console.warn('client_payments table may not exist yet:', cpError);
        }
      } catch (e) {
        console.warn('Error fetching client payments:', e);
      }

    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, date, statsMonth]);

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

  const handleExportCSV = () => {
    if (statsData.length === 0) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }

    const selectedMonthName = `${Number(statsMonth.split('-')[1])}월`;
    const headers = ['직원 이름', '이메일', `${selectedMonthName} 출근 일수`, `${selectedMonthName} 총 근무 시간`];
    const rows = statsData.map(item => [
      item.name,
      item.email,
      `${item.count}일`,
      `${Math.floor(item.totalMins / 60)}시간 ${item.totalMins % 60}분`
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.href = url;
    const currentMonth = statsMonth;
    link.download = `근태통계_${currentMonth}.csv`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) {
      alert('클라이언트 이름을 입력해 주세요.');
      return;
    }
    const dayNum = parseInt(paymentDay, 10);
    if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) {
      alert('결제일은 1일에서 31일 사이의 숫자여야 합니다.');
      return;
    }

    const payload = {
      client_name: clientName,
      payment_day: dayNum,
      amount: paymentAmount ? parseFloat(paymentAmount) : null,
      memo: paymentMemo || null,
    };

    setIsLoading(true);
    try {
      if (editingPayment) {
        const { error } = await supabase
          .from('client_payments')
          .update(payload)
          .eq('id', editingPayment.id);
        if (error) throw error;
        alert('결제 정보가 수정되었습니다.');
      } else {
        const { error } = await supabase
          .from('client_payments')
          .insert([payload]);
        if (error) throw error;
        alert('결제 정보가 등록되었습니다.');
      }
      setIsPaymentModalOpen(false);
      setClientName('');
      setPaymentDay('');
      setPaymentAmount('');
      setPaymentMemo('');
      setEditingPayment(null);
      
      await fetchData();
    } catch (err: any) {
      console.error('Error saving payment:', err);
      alert('저장 실패: ' + (err.message || '오류가 발생했습니다. DB 테이블이 생성되어 있는지 확인해 주세요.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePayment = async (id: string) => {
    if (!confirm('정말로 이 결제 정보를 삭제하시겠습니까?')) return;
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('client_payments')
        .delete()
        .eq('id', id);
      if (error) throw error;
      alert('삭제 완료되었습니다.');
      await fetchData();
    } catch (err: any) {
      console.error('Error deleting payment:', err);
      alert('삭제 실패: ' + (err.message || '오류가 발생했습니다.'));
    } finally {
      setIsLoading(false);
    }
  };

  const openAddPaymentModal = () => {
    setClientName('');
    setPaymentDay('');
    setPaymentAmount('');
    setPaymentMemo('');
    setEditingPayment(null);
    setIsPaymentModalOpen(true);
  };

  const openEditPaymentModal = (payment: any) => {
    setEditingPayment(payment);
    setClientName(payment.client_name);
    setPaymentDay(payment.payment_day.toString());
    setPaymentAmount(payment.amount ? payment.amount.toString() : '');
    setPaymentMemo(payment.memo || '');
    setIsPaymentModalOpen(true);
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

        {/* 월 선택 (근태 통계 탭에서 활성화) */}
        {activeTab === 'stats' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">조회 월</label>
            <input
              type="month"
              value={statsMonth}
              onChange={(e) => setStatsMonth(e.target.value)}
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
          <button
            onClick={() => setActiveTab('stats')}
            className={`${activeTab === 'stats' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
          >
            근태 통계
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`${activeTab === 'payments' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
          >
            결제일 관리
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
                      <td className="px-6 py-4 text-sm max-w-md align-top">
                        <WorkLogCell workLog={item.work_log} />
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

        {activeTab === 'stats' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                onClick={handleExportCSV}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
              >
                엑셀 다운로드 (CSV)
              </button>
            </div>
            <div className="overflow-x-auto bg-white rounded-lg shadow border border-gray-100">
              <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">직원 이름</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">이메일</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{Number(statsMonth.split('-')[1])}월 출근 일수</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{Number(statsMonth.split('-')[1])}월 총 근무 시간</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {statsData.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">{Number(statsMonth.split('-')[1])}월 근무 기록이 없습니다.</td>
                  </tr>
                ) : (
                  statsData.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{item.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.count}일</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-brand-600">
                        {Math.floor(item.totalMins / 60)}시간 {item.totalMins % 60}분
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-900">클라이언트 결제일 목록</h2>
                <p className="text-sm text-gray-500 mt-1">매월 등록된 결제일 아침에 텔레그램 봇으로 자동 알림이 전송됩니다.</p>
              </div>
              <button
                onClick={openAddPaymentModal}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-semibold rounded-md text-white bg-brand-600 hover:bg-brand-700 focus:outline-none transition-colors"
              >
                + 결제일 추가
              </button>
            </div>

            <div className="overflow-x-auto bg-white rounded-lg border border-gray-100">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">클라이언트 이름</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">매월 결제일</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">결제 금액</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">비고 / 메모</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">관리</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {clientPayments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-400 text-sm">
                        등록된 결제일 정보가 없습니다. (테이블을 생성하지 않은 경우 먼저 Supabase에 테이블을 생성해 주세요)
                      </td>
                    </tr>
                  ) : (
                    clientPayments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900 text-sm">{payment.client_name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-semibold">{payment.payment_day}일</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">
                          {payment.amount ? `${Number(payment.amount).toLocaleString('ko-KR')}원` : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{payment.memo || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold space-x-3">
                          <button
                            onClick={() => openEditPaymentModal(payment)}
                            className="text-brand-600 hover:text-brand-900 transition-colors"
                          >
                            수정
                          </button>
                          <button
                            onClick={() => handleDeletePayment(payment.id)}
                            className="text-red-600 hover:text-red-900 transition-colors"
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

            {/* 등록/수정 모달 */}
            {isPaymentModalOpen && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md my-8 transform transition-all">
                  <div className="flex justify-between items-center p-5 border-b border-gray-100 bg-gray-50/50 rounded-t-xl">
                    <h3 className="text-lg font-bold text-gray-900">
                      {editingPayment ? '결제일 정보 수정' : '신규 결제일 등록'}
                    </h3>
                    <button
                      onClick={() => setIsPaymentModalOpen(false)}
                      className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100 transition-colors focus:outline-none"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <form onSubmit={handleSavePayment}>
                    <div className="p-6 space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          클라이언트 이름 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={clientName}
                          onChange={(e) => setClientName(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-brand-500 focus:border-brand-500 text-gray-900"
                          placeholder="예: 브랜딩포유 주식회사"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          매월 결제일 (1~31일) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          required
                          min="1"
                          max="31"
                          value={paymentDay}
                          onChange={(e) => setPaymentDay(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-brand-500 focus:border-brand-500 text-gray-900"
                          placeholder="예: 25"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          결제 금액 (원)
                        </label>
                        <input
                          type="number"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-brand-500 focus:border-brand-500 text-gray-900"
                          placeholder="예: 1500000"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                          비고 / 메모
                        </label>
                        <textarea
                          rows={3}
                          value={paymentMemo}
                          onChange={(e) => setPaymentMemo(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-brand-500 focus:border-brand-500 text-gray-900"
                          placeholder="추가 정보가 있다면 기록해 주세요."
                        />
                      </div>
                    </div>
                    <div className="p-4 border-t border-gray-100 bg-gray-50/50 rounded-b-xl flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsPaymentModalOpen(false)}
                        className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors"
                      >
                        취소
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-semibold text-sm transition-colors"
                      >
                        저장
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
