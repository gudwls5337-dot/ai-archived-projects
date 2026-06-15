# Project
This is a lightweight B2B chemical CRM for outbound and inbound email sequence management.

## Goals
- Manage leads by segment:
  - exhibition_booth
  - tendata_volume
  - distributor_by_country
  - met_in_person
  - inbound
- Track pipeline stage separately from lead segment
- Support manual email sequences first
- Keep the system simple and maintainable

## Tech
- Next.js
- TypeScript
- Tailwind CSS

## Rules
- Keep UI text in Korean
- Prefer simple code over abstractions
- For multi-file edits, explain the plan first
- Do not add new dependencies unless necessary
- Every feature must support lead management or email sequence workflows

## Execution Rules

### Claude가 직접 실행 가능한 명령
- `npm run dev` — 사용자가 명시적으로 요청한 경우에만 1회 실행 (이미 실행 중이면 재실행 금지)

### Claude가 절대 직접 실행하면 안 되는 명령 (세션 꼬임 원인)
- `taskkill` — node 프로세스 종료
- `npx prisma generate` — Prisma client 재생성
- `npx prisma db push` — schema → DB 반영
- `curl` 또는 로컬 서버에 직접 HTTP 요청
- `prisma migrate dev` (Supabase 환경에서 금지)

### 코드 수정 요청 시 동작
- 파일 수정까지만 완료
- 실행 명령은 직접 돌리지 않고 사용자가 터미널에 입력할 명령만 안내

### 절대 금지
- 동일 명령 무한 재시도 또는 루프 실행
- background shell / long-running task 여러 개 병렬 생성
- 위 금지 명령을 Bash로 감싸서 우회 실행

### Schema 변경 시 사용자가 직접 실행할 순서 (단계별 1회씩)
1. `taskkill /F /IM node.exe` — 기존 node 종료
2. `npx prisma generate` — client 재생성
3. `npx prisma db push` — DB 반영
4. `npm run dev` — 서버 재시작

### 답변 형식 고정
코드 수정 작업 완료 시 항상 아래 형식으로 마무리:
1. 수정된 파일 목록
2. 변경 내용 요약
3. 터미널에서 직접 실행할 명령
4. 브라우저에서 확인할 경로

## Main entities
- leads
- contacts
- sequences
- sequence_steps
- email_logs

## MVP scope
- lead list
- lead detail
- sequence editor
- manual email sending
