# news-shorts-bot

뉴스를 자동 수집하고 유튜브 숏츠용 콘텐츠 패키지로 변환하는 봇입니다.

---

## 아침 루틴 (매일 이것만 하면 됩니다)

```bash
# Step 1 — 뉴스 수집 + 숏츠 문안 자동 생성 (약 1~2분 소요)
npm run dev

# Step 2 — 엑셀로 발행 대상 선택 + 문구 직접 수정
#   outputs/final/YYYY-MM-DD-final.csv 를 엑셀로 열어서:
#   - 올릴 행의 "업로드 후보(TRUE/FALSE)" 열을 TRUE 로 수정
#   - 필요하면 "추천 제목 / 추천 훅 문구 / 추천 썸네일 문구" 직접 수정
#   - 필요하면 "검토 메모" 열에 메모 추가
#   - ⚠️ "민감 이슈 주의" 열이 있는 행은 반드시 내용 확인 후 결정
#   저장 후 엑셀 닫기

# Step 3 — 저장한 CSV 검증 (권장)
npm run validate-final
#   → outputs/final/YYYY-MM-DD-validation.md 에서 오류/경고 확인
#   → ❌ 오류가 있으면 엑셀 수정 후 다시 저장 → 재검증
#   → ⚠️ 경고만 있으면 확인 후 진행 가능

# Step 4 — 엑셀 편집 내용 반영 + 선택 항목만 추출
npm run gen-select
#   → outputs/final/YYYY-MM-DD-selected.json
#   (비워둔 칸은 자동 채움 / 직접 수정한 칸은 그대로 유지)

# Step 5 — 선택한 항목만 발행 파일로 추출
npm run gen-publish
#   → selected.json 이 있으면 우선 사용, 없으면 final.json 사용

# Step 6 — 아침 5분 훑어보기용 리포트 생성
npm run publish-report
#   → outputs/publish/YYYY-MM-DD-publish.md 를 열어서 최종 확인
```

> 매일 실제로 누르는 명령어: `npm run dev` → (엑셀 편집) → `npm run validate-final` → `npm run gen-select` → `npm run gen-publish` → `npm run publish-report`

---

## 처음 시작하기

```bash
npm install
cp .env.example .env
# .env 파일에 네이버 API 키 입력 (없어도 RSS만으로 동작함)
npm run dev
```

---

## 파이프라인 구조

```
[Step 1] 수집        → RSS + 네이버 API          → outputs/raw
[Step 2] 전처리      → HTML 제거, 중복 제거        → outputs/processed
[Step 3] 점수화      → 이슈 클러스터링 + 점수 계산  → outputs/ranked
[Step 4] 숏츠 생성   → 제목/훅/해시태그/썸네일      → outputs/shorts
[Step 5] 리포트      → 사람이 검토할 markdown      → outputs/reports
[Step 6] 최종 export → 업로드용 CSV + JSON         → outputs/final
[Step 7] 발행 추출   → uploadCandidate 필터링      → outputs/publish
[Step 8] 발행 리포트 → 아침 5분 훑어보기용 markdown  → outputs/publish
```

---

## 명령어 전체 목록

### 매일 사용하는 명령어

| 명령어 | 설명 |
|--------|------|
| `npm run dev` | 전체 파이프라인 실행 (수집 → 문안 생성 → CSV 저장) |
| `npm run today` | 오늘 생성된 파일 경로를 한눈에 보여주는 TODAY.md 를 루트에 생성 |
| `npm run validate-final` | final.csv 열·값·길이 검증 → validation.md 저장 |
| `npm run gen-select` | 엑셀 편집 내용을 final.json에 병합 → selected.json 저장 |
| `npm run gen-publish` | selected.json(우선) 또는 final.json → publish 파일 추출 |
| `npm run publish-report` | publish.json → 아침 5분 훑어보기용 markdown 리포트 생성 |

### 개별 재실행용 (필요할 때만)

| 명령어 | 설명 |
|--------|------|
| `npm run report` | shorts 결과로 검토용 리포트만 다시 생성 |
| `npm run final` | shorts 결과로 최종 CSV + JSON만 다시 생성 |
| `npm run collect` | 수집 파이프라인만 단독 실행 (dev와 동일) |

### 빌드 / 자동화

| 명령어 | 설명 |
|--------|------|
| `npm run schedule` | 스케줄러를 통해 즉시 실행 (자동화 준비용) |
| `npm run build` | TypeScript → JavaScript 빌드 |
| `npm run start` | 빌드된 JavaScript 실행 |

---

## 결과 파일 경로

| 단계 | 경로 |
|------|------|
| 수집 원본 | `outputs/raw/YYYY-MM-DD.json` |
| 전처리 결과 | `outputs/processed/YYYY-MM-DD.json` |
| 점수 순위 | `outputs/ranked/YYYY-MM-DD.json` |
| 숏츠 패키지 | `outputs/shorts/YYYY-MM-DD.json` |
| 검토용 리포트 | `outputs/reports/YYYY-MM-DD-report.md` |
| 최종 CSV | `outputs/final/YYYY-MM-DD-final.csv` |
| 최종 JSON | `outputs/final/YYYY-MM-DD-final.json` |
| 발행 CSV | `outputs/publish/YYYY-MM-DD-publish.csv` |
| 발행 JSON | `outputs/publish/YYYY-MM-DD-publish.json` |
| 발행 리포트 | `outputs/publish/YYYY-MM-DD-publish.md` |
| 실행 로그 | `outputs/logs/YYYY-MM-DD.log` |

---

## final.csv 수정 방법 (엑셀)

1. `outputs/final/YYYY-MM-DD-final.csv` 를 엑셀로 열기
2. `업로드 후보(TRUE/FALSE)` 열 — 올릴 이슈 행에 `TRUE` 입력
3. `검토 메모` 열 — 수정사항이나 참고사항 자유롭게 메모
4. ⚠️ `민감 이슈 주의` 열이 비어 있지 않은 행은 내용 확인 필수
5. 저장 후 엑셀 닫기 → `npm run gen-publish` 실행

> 수정하지 않으면 `uploadCandidate=true` 인 항목이 없어 gen-publish 가 오류를 냅니다.

---

## publish-report 리포트 포함 항목

| 항목 | 설명 |
|------|------|
| 순위 + 대표 기사 제목 | 섹션 헤더로 표시 |
| `bestTitle` | 추천 영상 제목 |
| `bestHook` | 오프닝 훅 문구 |
| `bestThumbnailText` | 썸네일에 넣을 문구 |
| `hashtags` | 해시태그 모음 |
| `reviewMemo` | 검토 메모 (있을 때만 표시) |
| `warning` | ⚠️ 민감 이슈 경고 (있을 때만 강조 표시) |

---

## 엑셀(xlsx) 저장 경로

`npm run dev` 또는 `npm run auto-run` 실행 시 자동으로 아래 경로에 저장됩니다.

| 종류 | 경로 | 생성 시점 |
|------|------|-----------|
| 일자별 엑셀 | `outputs/excel/daily/YYYY-MM-DD-news.xlsx` | 매일 오전 7시 또는 `npm run dev` |
| 시간별 엑셀 | `outputs/excel/hourly/YYYY-MM-DD-HH-news.xlsx` | 매 3시간마다 |

**엑셀 시트 구성**

- `Ranked` 시트: 순위 / 대표 기사 제목 / 출처 수 / 기사 수 / 대표 키워드
- `Final` 시트: 순위 / 대표 기사 제목 / 30초 요약 / 추천 제목 / 훅 문구 / 썸네일 문구 / 해시태그 / 업로드 후보 / 검토 메모

---

## 자동 반복 실행

### 수동으로 켜는 방법 (권장)

```bash
# 이 명령어 하나로 자동 반복 시작
npm run auto-run
```

- 터미널 창이 열려 있는 동안 계속 실행됩니다
- 매 3시간 정각 + 매일 오전 7시에 자동으로 파이프라인을 실행합니다
- 종료하려면 `Ctrl+C` 를 누르세요

> ⚠️ **PC가 꺼져 있거나 절전 모드이면 해당 시간의 실행은 건너뜁니다.**
> 실행이 필요한 경우 PC를 켜둔 채로 `npm run auto-run` 을 실행하세요.

### Windows 작업 스케줄러로 PC 시작 시 자동 실행 등록

PC를 켜면 자동으로 스케줄러가 시작되게 하려면 아래 명령어를 **관리자 권한 명령 프롬프트**에서 실행하세요.

```bat
schtasks /create /tn "NewsShortsBot" /tr "cmd /c cd /d C:\Users\user\Desktop\news-shorts-bot && npm run auto-run >> outputs/logs/scheduler.log 2>&1" /sc onlogon /ru "%USERNAME%" /f
```

- `/sc onlogon` : 로그인할 때마다 자동 시작
- 등록 후에는 PC를 재시작하면 자동으로 스케줄러가 켜집니다
- 등록 취소: `schtasks /delete /tn "NewsShortsBot" /f`

---

## 뉴스 소스

- **RSS** (키 없이 동작): 한겨레, 조선일보, 전자신문, 아시아경제
- **네이버 뉴스 API**: `.env`에 키 입력 시 추가 수집

---

## 네이버 뉴스 API 설정 방법

API 키가 없어도 RSS만으로 정상 동작합니다.
뉴스 품질을 높이려면 아래 순서로 설정하세요.

**키 발급 방법**

1. [https://developers.naver.com](https://developers.naver.com) 접속 후 로그인
2. 상단 메뉴 [Application] → [애플리케이션 등록] 클릭
3. 애플리케이션 이름 자유롭게 입력
4. 사용 API 목록에서 **검색** 선택
5. 등록 완료 후 `Client ID` / `Client Secret` 복사

**키 입력 방법**

```bash
# .env.example 을 .env 로 복사
cp .env.example .env
```

`.env` 파일을 텍스트 편집기로 열어 아래처럼 수정:

```
NAVER_CLIENT_ID=발급받은_Client_ID
NAVER_CLIENT_SECRET=발급받은_Client_Secret

# 검색할 키워드 (쉼표로 구분)
SEARCH_KEYWORDS=AI,반도체,경제,스타트업
```

**키 유무에 따른 동작 차이**

| 상태 | 동작 |
|------|------|
| 키 없음 (기본) | RSS만 수집. 콘솔에 "네이버 수집 건너뜀" 표시 |
| 키 있음 | RSS + 네이버 API 병렬 수집. 키워드별 최대 20건 추가 |

> ⚠️ `.env` 파일은 절대 git에 올리지 마세요. `.gitignore`에 이미 포함되어 있습니다.
