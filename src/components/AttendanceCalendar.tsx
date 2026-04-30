'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  eachDayOfInterval 
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function AttendanceCalendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [leaveData, setLeaveData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchMonthData();
  }, [currentMonth]);

  const fetchMonthData = async () => {
    setIsLoading(true);
    const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
    const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

    try {
      const { data: att } = await supabase
        .from('attendance')
        .select('*, users(name)')
        .gte('date', start)
        .lte('date', end);
      
      const { data: leaves } = await supabase
        .from('leave_requests')
        .select('*, users(name)')
        .gte('request_date', start)
        .lte('request_date', end);

      setAttendanceData(att || []);
      setLeaveData(leaves || []);
    } catch (error) {
      console.error('Error fetching calendar data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const renderHeader = () => {
    return (
      <div className="flex items-center justify-between mb-6 px-2">
        <h2 className="text-xl font-bold text-gray-900">
          {format(currentMonth, 'yyyy년 M월', { locale: ko })}
        </h2>
        <div className="flex space-x-2">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="px-3 py-1 text-sm font-medium text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
          >
            오늘
          </button>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>
    );
  };

  const renderDays = () => {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return (
      <div className="grid grid-cols-7 mb-2 border-b border-gray-100">
        {days.map((day, idx) => (
          <div key={idx} className={`py-2 text-center text-xs font-semibold uppercase tracking-wider ${day === '일' ? 'text-red-400' : day === '토' ? 'text-blue-400' : 'text-gray-400'}`}>
            {day}
          </div>
        ))}
      </div>
    );
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const formattedDate = format(day, 'yyyy-MM-dd');
        const dayAttendance = attendanceData.filter(a => a.date === formattedDate);
        const dayLeaves = leaveData.filter(l => l.request_date === formattedDate);
        
        const isCurrentMonth = isSameMonth(day, monthStart);
        const isToday = isSameDay(day, new Date());

        days.push(
          <div
            key={day.toString()}
            onClick={() => {
              setSelectedDate(formattedDate);
              setIsModalOpen(true);
            }}
            className={`min-h-[100px] p-2 border-r border-b border-gray-50 transition-colors cursor-pointer hover:bg-gray-100 ${!isCurrentMonth ? 'bg-gray-50/30' : ''}`}
          >
            <div className="flex justify-between items-start">
              <span className={`text-sm font-medium ${!isCurrentMonth ? 'text-gray-300' : isToday ? 'bg-brand-600 text-white w-6 h-6 rounded-full flex items-center justify-center' : day.getDay() === 0 ? 'text-red-400' : day.getDay() === 6 ? 'text-blue-400' : 'text-gray-700'}`}>
                {format(day, 'd')}
              </span>
            </div>
            
            <div className="mt-2 space-y-1">
              {dayAttendance.length > 0 && (
                <div className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-700 rounded border border-green-100 flex justify-between">
                  <span>출근</span>
                  <span className="font-bold">{dayAttendance.length}명</span>
                </div>
              )}
              {dayLeaves.map((leave, idx) => (
                <div key={idx} className={`text-[10px] px-1.5 py-0.5 rounded border truncate ${leave.status === 'approved' ? 'bg-amber-50 text-amber-700 border-amber-100' : leave.status === 'pending' ? 'bg-gray-100 text-gray-500 border-gray-200' : 'hidden'}`}>
                  {leave.users.name} ({leave.type === 'full_day' ? '월차' : leave.type === 'half_day' ? '반차' : '조퇴'})
                  {leave.status === 'pending' && ' (대기)'}
                </div>
              ))}
            </div>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }

    return <div className="border-t border-l border-gray-50 rounded-lg overflow-hidden">{rows}</div>;
  };

  return (
    <div className="p-4 sm:p-6 bg-white">
      {renderHeader()}
      {renderDays()}
      {isLoading ? (
        <div className="h-[400px] flex items-center justify-center text-gray-400">데이터 로딩 중...</div>
      ) : (
        renderCells()
      )}
      
      <div className="mt-6 flex flex-wrap gap-4 text-xs text-gray-500">
        <div className="flex items-center"><span className="w-3 h-3 bg-green-100 border border-green-200 rounded mr-1"></span> 출근</div>
        <div className="flex items-center"><span className="w-3 h-3 bg-amber-100 border border-amber-200 rounded mr-1"></span> 승인된 휴가</div>
        <div className="flex items-center"><span className="w-3 h-3 bg-gray-100 border border-gray-200 rounded mr-1"></span> 대기 중인 휴가</div>
      </div>

      {/* 날짜 상세 보기 모달 */}
      {isModalOpen && selectedDate && (
        <div className="fixed inset-0 z-[100] overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setIsModalOpen(false)}></div>
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
            <div className="relative inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full z-10 p-6">
              <h3 className="text-lg leading-6 font-bold text-gray-900 mb-4 border-b pb-2">
                {selectedDate} 상세 내역
              </h3>
              
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-semibold text-green-600 mb-2 flex items-center">
                    <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                    출근자 ({attendanceData.filter(a => a.date === selectedDate).length}명)
                  </h4>
                  <ul className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg border border-gray-100 max-h-40 overflow-y-auto">
                    {attendanceData.filter(a => a.date === selectedDate).length > 0 ? (
                      attendanceData.filter(a => a.date === selectedDate).map((a, i) => (
                        <li key={i} className="py-1 border-b border-gray-100 last:border-0 flex justify-between">
                          <span>{a.users.name}</span>
                          <span className="text-gray-500">{a.check_in_time ? format(new Date(a.check_in_time), 'HH:mm') : ''}</span>
                        </li>
                      ))
                    ) : (
                      <li className="text-gray-400">출근 기록이 없습니다.</li>
                    )}
                  </ul>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-amber-600 mb-2 flex items-center">
                    <span className="w-2 h-2 rounded-full bg-amber-500 mr-2"></span>
                    휴가/조퇴자 ({leaveData.filter(l => l.request_date === selectedDate && l.status !== 'rejected').length}명)
                  </h4>
                  <ul className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg border border-gray-100 max-h-40 overflow-y-auto">
                    {leaveData.filter(l => l.request_date === selectedDate && l.status !== 'rejected').length > 0 ? (
                      leaveData.filter(l => l.request_date === selectedDate && l.status !== 'rejected').map((l, i) => (
                        <li key={i} className="py-1 border-b border-gray-100 last:border-0 flex justify-between items-center">
                          <span>{l.users.name}</span>
                          <span className={`${l.status === 'approved' ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                            {l.type === 'full_day' ? '월차' : l.type === 'half_day' ? '반차' : '조퇴'}
                            {l.status === 'pending' && ' (대기 중)'}
                          </span>
                        </li>
                      ))
                    ) : (
                      <li className="text-gray-400">휴가자가 없습니다.</li>
                    )}
                  </ul>
                </div>
              </div>

              <div className="mt-6 text-right">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-sm font-medium transition-colors"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
