# 🎬 YouTube 쇼츠 정보 추출 도구

조회수 폭발 쇼츠의 패턴을 분석하기 위한 자동화 도구입니다.

## ✨ 주요 기능

- ✅ **YouTube 채널 쇼츠 자동 추출**
- ✅ **Whisper 음성 인식 자막 추출** (핵심!)
- ✅ **메타데이터 수집** (제목, 조회수, 설명, 해시태그)
- ✅ **CSV/JSON/XLSX 형식 저장**
- ✅ **웹 UI + CLI 지원**

## 🚀 빠른 시작

### 방법 1: 웹 UI (가장 쉬움) ✨
```bash
python main.py
# http://localhost:8002/docs 접속 → FastAPI 문서에서 직접 테스트
```

### 방법 2: 명령어
```bash
# 기본 사용
python scraper.py --url "https://www.youtube.com/@MrBeast" --max 10

# 옵션 지정
python scraper.py -u "https://www.youtube.com/@TED" -m 50 -s popular -f xlsx
```

**옵션:**
- `-u, --url`: YouTube 채널 URL (필수)
- `-m, --max`: 추출 개수 (기본: 50, 최대: 200)
- `-s, --sort`: 정렬 (newest/popular, 기본: newest)
- `-f, --format`: 저장 형식 (csv/json/xlsx, 기본: csv)

## 📋 설치 및 설정

### 1. 필수 소프트웨어
- **Python 3.8+** (권장: 3.13.1)
- **pip** (Python 패키지 매니저)
- **ffmpeg** (음성 인식을 위한 오디오 변환)

### 2. 의존성 설치
```bash
pip install -r requirements.txt
```

**설치되는 주요 패키지:**
- `fastapi` & `uvicorn` - 웹 서버
- `openai-whisper` - 음성 인식 (자막 추출)
- `yt-dlp` - YouTube 동영상 다운로드
- `openpyxl` - Excel 파일 생성
- `google-api-python-client` - YouTube API 연동

### 3. API 키 설정
[Google Cloud Console](https://console.cloud.google.com/)에서 YouTube Data API v3 키 발급:

```bash
# .env 파일 생성 및 API 키 입력
echo "YOUTUBE_API_KEY=your_api_key_here" > .env
```

⚠️ **보안 주의**: `.env` 파일은 절대 GitHub에 커밋하지 않음 (.gitignore 등록됨)

## 📁 파일 구조

```
youtube-shorts-scraper/
├── main.py                 # FastAPI 웹 서버 (포트: 8002)
├── scraper.py              # CLI 스크립트
├── config.py               # 설정
├── requirements.txt        # 의존성 패키지
├── .env                    # API 키 (보안: .gitignore 설정됨)
├── youtube_api/
│   ├── scraper.py          # YouTubeShortsScraper 클래스
│   ├── auth.py             # YouTube API 인증
│   └── transcript.py       # 자막 추출
├── data/
│   ├── models.py           # 데이터 모델
│   ├── storage.py          # CSV/JSON/XLSX 저장
│   └── output/             # 생성된 파일들
├── docs/
│   └── test_report.md      # 테스트 리포트 (2026-06-15)
└── 가이드.txt              # 상세 사용 가이드
```

## ⏱️ 처리 시간

1개: 1-2분 (모델 로드)
5개: 3-5분
10개: 5-10분
50개: 25-50분

## 📞 API 할당량

일일 무료: 10,000 units
채널당 비용: ~105 units
일일 처리 가능: 약 95개 채널

## ⚠️ 주의사항

- YouTube 약관 준수
- API 키 보안 유지
- 대량 요청시 IP 차단 가능
- 인터넷 연결 필수

## 🔧 최근 수정사항 (v1.1.0)

### 2026-06-15 버그 수정 및 개선
- **Fix**: 클래스명 오류 수정 (`YouTubeShortsScra` → `YouTubeShortsScraper`)
- **Fix**: requirements.txt 의존성 보충 (whisper, yt-dlp, openpyxl)
- **Docs**: 전체 테스트 리포트 추가 (`docs/test_report.md`)
- **Improve**: README 및 문서 개선

**테스트 상태**: ✅ 모든 기능 정상 작동

자세한 내용은 [`docs/test_report.md`](docs/test_report.md)를 참고하세요.

---

더 자세한 내용은 "가이드.txt"를 참고하세요!
