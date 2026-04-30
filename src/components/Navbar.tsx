'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { LogOut, User as UserIcon } from 'lucide-react';

export default function Navbar() {
  const { user, signOut } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  if (pathname === '/login' || pathname === '/register') {
    return null; // Do not show navbar on auth pages
  }

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center space-x-6">
            <Link href={user?.role === 'admin' ? '/admin' : '/dashboard'} className="flex items-center flex-shrink-0">
              <span className="text-xl font-bold text-brand-600 tracking-tight">Branding4U</span>
              <span className="ml-2 text-sm font-medium text-gray-500 hidden sm:block">근태 관리</span>
            </Link>
            
            {user?.role === 'admin' && (
              <div className="hidden md:flex items-center space-x-4 ml-4">
                <Link 
                  href="/admin" 
                  className={`text-sm font-medium ${pathname === '/admin' ? 'text-brand-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  관리자 패널
                </Link>
                <Link 
                  href="/dashboard" 
                  className={`text-sm font-medium ${pathname === '/dashboard' ? 'text-brand-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  직원 모드
                </Link>
              </div>
            )}
          </div>
          
          {user && (
            <div className="flex items-center space-x-4">
              <div className="flex items-center text-sm font-medium text-gray-700">
                <UserIcon className="w-4 h-4 mr-2 text-brand-500" />
                <span className="hidden sm:inline">{user.name}</span>
                {user.role === 'admin' && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-brand-100 text-brand-700 rounded-full">
                    관리자
                  </span>
                )}
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center text-gray-500 hover:text-red-600 transition-colors p-2 rounded-md hover:bg-red-50"
                title="로그아웃"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
