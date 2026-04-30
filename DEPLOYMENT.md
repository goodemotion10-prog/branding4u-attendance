# Vercel 배포 가이드

브랜딩포유 근태 관리 시스템을 실제 인터넷(Vercel)에 배포하기 위한 안내서입니다.

## 1. 사전 준비 (Supabase)
Supabase 대시보드(https://supabase.com)에서 프로젝트를 생성하고, `supabase/schema.sql` 내용을 SQL Editor에서 실행하여 테이블과 권한(RLS)을 설정하세요.

설정이 완료되면 `Project Settings -> API` 페이지에서 다음 값을 복사해 둡니다:
- `Project URL`
- `Project API Keys (anon, public)`

## 2. GitHub 리포지토리 생성
현재 폴더(`branding4u-attendance`)를 GitHub 리포지토리로 푸시합니다.

```bash
git init
git add .
git commit -m "Initial commit: Branding4U Attendance System"
git branch -M main
git remote add origin https://github.com/당신의_아이디/리포지토리이름.git
git push -u origin main
```

## 3. Vercel 배포
1. [Vercel](https://vercel.com/) 에 로그인하고 `Add New -> Project`를 클릭합니다.
2. 방금 푸시한 GitHub 리포지토리를 선택(Import)합니다.
3. **Environment Variables(환경 변수)** 섹션을 열고 다음 값을 입력합니다.

| NAME | VALUE |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase의 Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase의 anon public API Key |

4. `Deploy` 버튼을 클릭합니다.
5. 빌드가 완료되면 Vercel이 제공하는 도메인(예: `branding4u-attendance.vercel.app`)으로 접속할 수 있습니다.

## 4. 커스텀 도메인 연결 (선택)
Vercel 대시보드의 `Settings -> Domains` 메뉴에서 브랜딩포유 전용 커스텀 도메인(예: `attendance.branding4u.com`)을 등록할 수 있습니다.
