# 🎬 YouTube 쇼츠 정보 추출 도구

조회수 폭발 쇼츠의 패턴을 분석하기 위한 자동화 도구입니다.

## ✨ 주요 기능

- ✅ **YouTube 채널 쇼츠 자동 추출**
- ✅ **Whisper 음성 인식 자막 추출** (핵심!)
- ✅ **메타데이터 수집** (제목, 조회수, 설명, 해시태그)
- ✅ **CSV/JSON/XLSX 형식 저장**
- ✅ **웹 UI + CLI 지원**

## 🚀 빠른 시작

### 방법 1: 웹 UI (가장 쉬움)
```bash
python main.py
```
브라우저에서 http://localhost:8001/docs 접속

### 방법 2: 명령어
```bash
python scraper.py --url "https://www.youtube.com/@채널명" --max 5 --format xlsx
```

### 방법 3: 배치 파일
실행.bat 파일 더블클릭

## 📋 설치 및 설정

### 1. 필수 소프트웨어
- Python 3.8+
- pip

### 2. 의존성 설치
```bash
pip install -r requirements.txt
```

### 3. API 키 설정
.env 파일에 YouTube API 키 입력

## 📁 파일 구조

youtube-shorts-scraper/
├── main.py                 # FastAPI 웹 서버
├── scraper.py              # CLI 스크립트
├── config.py               # 설정
├── requirements.txt        # 의존성
├── .env                    # API 키
├── youtube_api/            # YouTube API 연동
├── data/                   # 데이터 저장
└── 가이드.txt              # 사용 가이드

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

더 자세한 내용은 "가이드.txt"를 참고하세요!
