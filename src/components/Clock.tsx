'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

export default function Clock() {
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    setTime(new Date());
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  if (!time) return null;

  return (
    <div className="text-center">
      <div className="text-4xl sm:text-6xl font-bold text-white tracking-tight font-mono">
        {format(time, 'HH:mm:ss')}
      </div>
      <div className="mt-2 text-lg text-white/80 font-medium">
        {format(time, 'yyyy년 MM월 dd일 (EEEE)', { locale: ko })}
      </div>
    </div>
  );
}
