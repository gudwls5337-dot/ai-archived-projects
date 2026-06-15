# YouTube 쇼츠 정보 추출 API

YouTube 채널의 쇼츠(Shorts) 영상 정보를 자동으로 추출하고 CSV/JSON 형식으로 저장하는 FastAPI 애플리케이션입니다.

## 기능

- ✅ YouTube 채널의 쇼츠 영상 자동 감지 (60초 이하)
- ✅ 메타데이터 추출: 제목, 조회수, 설명, 해시태그, 게시 날짜
- ✅ 자동생성 자막(Transcript) 추출
- ✅ 정렬 옵션: 최신순, 인기순
- ✅ CSV/JSON 형식으로 자동 저장
- ✅ FastAPI 웹 API 제공
- ✅ 무료 (YouTube Data API 일일 10,000 quota units)

## 필수 요구사항

- Python 3.8+
- YouTube Data API 키

## 설치 및 설정

### 1. 의존성 설치

```bash
cd youtube-shorts-scraper
pip install -r requirements.txt
```

### 2. YouTube API 키 발급

1. [Google Cloud Console](https://console.cloud.google.com/)에 접속
2. 새 프로젝트 생성
3. "YouTube Data API v3" 활성화
4. 서비스 계정 또는 OAuth 2.0 클라이언트 ID 생성
5. API 키 복사

### 3. .env 파일 생성

```bash
cp .env.example .env
```

`.env` 파일에 API 키 입력:
```
YOUTUBE_API_KEY=your_api_key_here
MAX_RESULTS_DEFAULT=50
MAX_RESULTS_LIMIT=200
```

### 4. 서버 실행

```bash
python main.py
```

또는:
```bash
uvicorn main:app --reload
```

서버가 `http://localhost:8000`에서 실행됩니다.

## API 사용법

### 1. 쇼츠 정보 추출 (POST /scrape)

**요청**:
```bash
curl -X POST "http://localhost:8000/scrape" \
  -H "Content-Type: application/json" \
  -d '{
    "channel_url": "https://www.youtube.com/@MrBeast",
    "max_results": 50,
    "sort_by": "newest",
    "output_format": "csv"
  }'
```

**응답**:
```json
{
  "status": "success",
  "shorts_count": 50,
  "filename": "MrBeast_shorts_newest_2026-06-10.csv",
  "download_url": "/download/MrBeast_shorts_newest_2026-06-10.csv"
}
```

### 파라미터 설명

| 파라미터 | 설명 | 기본값 | 필수 |
|---------|------|-------|------|
| `channel_url` | YouTube 채널 URL | - | ✅ |
| `max_results` | 추출할 쇼츠 개수 (1-200) | 50 | ❌ |
| `sort_by` | 정렬 방식 (`newest`, `popular`) | newest | ❌ |
| `output_format` | 저장 형식 (`csv`, `json`) | csv | ❌ |

### sort_by 옵션

- **newest**: 게시 날짜 기준 내림차순 (최신 먼저)
- **popular**: 조회수 기준 내림차순 (인기순)

### 2. 파일 다운로드 (GET /download/{filename})

```bash
curl "http://localhost:8000/download/MrBeast_shorts_newest_2026-06-10.csv" \
  -o result.csv
```

### 3. API 문서

자동 생성된 API 문서:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 출력 형식

### CSV 예시

```
video_id,title,duration,views,upload_date,description,hashtags,transcript,url
dQw4w9WgXcQ,Amazing Video,45,1000000,2026-06-10T12:30:00Z,Check this out!,#viral #shorts,Great content here...,https://www.youtube.com/shorts/dQw4w9WgXcQ
```

### JSON 예시

```json
[
  {
    "video_id": "dQw4w9WgXcQ",
    "title": "Amazing Video",
    "duration": 45,
    "views": 1000000,
    "upload_date": "2026-06-10T12:30:00Z",
    "description": "Check this out!",
    "hashtags": ["#viral", "#shorts"],
    "transcript": "Great content here...",
    "url": "https://www.youtube.com/shorts/dQw4w9WgXcQ"
  }
]
```

## 할당량 및 제한사항

| 항목 | 값 |
|------|-----|
| 일일 무료 할당량 | 10,000 units |
| 기본 추출 범위 | 50개/채널 |
| 최대 추출 범위 | 200개/채널 |
| 일일 처리 가능 채널 | ~500개 |

**할당량 계산**: 50개 쇼츠 추출 시 약 10-20 units 소비

더 많은 영상을 추출하려면 [Google Cloud Console](https://console.cloud.google.com/)에서 할당량 증설을 신청하세요 (무료).

## 예제

### Python 스크립트

```python
import requests

response = requests.post(
    "http://localhost:8000/scrape",
    json={
        "channel_url": "https://www.youtube.com/@MrBeast",
        "max_results": 50,
        "sort_by": "popular"
    }
)

result = response.json()
print(f"추출 완료: {result['shorts_count']}개 쇼츠")
print(f"다운로드: {result['download_url']}")
```

### 여러 채널 처리

```python
import requests
import time

channels = [
    "https://www.youtube.com/@MrBeast",
    "https://www.youtube.com/@TED",
    "https://www.youtube.com/@NASA"
]

for channel_url in channels:
    response = requests.post(
        "http://localhost:8000/scrape",
        json={"channel_url": channel_url, "max_results": 30}
    )
    result = response.json()
    print(f"{channel_url}: {result['shorts_count']}개 추출")
    time.sleep(1)  # Rate limiting
```

## 주의사항

- YouTube API 키는 환경 변수로 보호하세요 (.env 파일 사용)
- YouTube 약관을 준수하세요
- 자막이 없는 영상은 "자막 없음"으로 표시됩니다
- 비공개 또는 삭제된 영상은 자동으로 필터링됩니다

## 문제 해결

### "YOUTUBE_API_KEY not found" 오류
→ `.env` 파일이 존재하고 API 키가 올바르게 입력되었는지 확인하세요.

### "Invalid YouTube URL" 오류
→ 올바른 형식의 채널 URL을 사용하세요 (예: https://www.youtube.com/@channelname)

### 쇼츠를 찾을 수 없는 경우
→ 채널이 쇼츠를 업로드했는지 확인하세요. 극히 드문 경우입니다.

## 향후 계획

- [ ] 웹 UI 추가 (React)
- [ ] 여러 채널 동시 처리
- [ ] 데이터베이스 저장 (SQLite/PostgreSQL)
- [ ] 정기 업데이트 스케줄링 (APScheduler)
- [ ] 캐싱 기능

## 라이선스

MIT License
